# Kleine API ohne Abhaengigkeiten: zaehlt Besuche in Redis (RESP per Socket)
# und spricht ueber das ServiceAccount-Token mit der Kubernetes-API.
import json, os, socket, ssl, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

POD = os.environ.get("HOSTNAME", "?")
NS = "demo"
SA = "/var/run/secrets/kubernetes.io/serviceaccount"
K8S = "https://kubernetes.default.svc"

def redis(*args):
    s = socket.create_connection(("redis", 6379), timeout=2)
    cmd = f"*{len(args)}\r\n" + "".join(f"${len(str(a))}\r\n{a}\r\n" for a in args)
    s.sendall(cmd.encode()); data = s.recv(4096).decode(); s.close()
    return data.split("\r\n")[0][1:]

def k8s(method, path, body=None):
    token = open(f"{SA}/token").read()
    ctx = ssl.create_default_context(cafile=f"{SA}/ca.crt")
    req = urllib.request.Request(K8S + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/merge-patch+json"})
    with urllib.request.urlopen(req, context=ctx, timeout=3) as r:
        return json.loads(r.read())

def pods():
    items = k8s("GET", f"/api/v1/namespaces/{NS}/pods")["items"]
    out = []
    for p in items:
        cs = (p["status"].get("containerStatuses") or [{}])[0]
        ready = cs.get("ready", False)
        phase = "Terminating" if p["metadata"].get("deletionTimestamp") else p["status"]["phase"]
        out.append({"name": p["metadata"]["name"], "app": p["metadata"]["labels"].get("app"),
                    "phase": phase, "ready": ready, "restarts": cs.get("restartCount", 0),
                    "node": p["spec"].get("nodeName"), "ip": p["status"].get("podIP")})
    return sorted(out, key=lambda x: (x["app"] or "", x["name"]))

class H(BaseHTTPRequestHandler):
    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
    def do_GET(self):
        try:
            if self.path == "/api/hello":
                self.send(200, {"pod": POD, "visits": int(redis("INCR", "visits"))})
            elif self.path == "/api/pods":
                d = k8s("GET", f"/apis/apps/v1/namespaces/{NS}/deployments/api")
                self.send(200, {"replicas": d["spec"]["replicas"], "pods": pods()})
            elif self.path == "/healthz":
                self.send(200, {"ok": True})
            else:
                self.send(404, {"error": "not found"})
        except Exception as e:
            self.send(500, {"error": str(e), "pod": POD})
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/scale":
                r = max(1, min(6, int(body["replicas"])))
                k8s("PATCH", f"/apis/apps/v1/namespaces/{NS}/deployments/api", {"spec": {"replicas": r}})
                self.send(200, {"replicas": r})
            elif self.path == "/api/kill":
                name = body["name"]
                if not name.startswith("api-"):
                    return self.send(400, {"error": "nur api-Pods"})
                k8s("DELETE", f"/api/v1/namespaces/{NS}/pods/{name}")
                self.send(200, {"deleted": name})
            else:
                self.send(404, {"error": "not found"})
        except Exception as e:
            self.send(500, {"error": str(e)})

ThreadingHTTPServer(("", 8000), H).serve_forever()
