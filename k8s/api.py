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

def esc(k):
    return str(k).replace("~", "~0").replace("/", "~1")

def ref(*parts):
    return {"$ref": "#/" + "/".join(esc(p) for p in parts)}

def cluster_tree():
    """Die Objekte des Namespace als JSON mit $ref-Verweisen (JSON Pointer)."""
    ls = lambda path: k8s("GET", path)["items"]
    deps = ls(f"/apis/apps/v1/namespaces/{NS}/deployments")
    rss = [r for r in ls(f"/apis/apps/v1/namespaces/{NS}/replicasets") if r["spec"].get("replicas")]
    pods = ls(f"/api/v1/namespaces/{NS}/pods")
    svcs = ls(f"/api/v1/namespaces/{NS}/services")
    cms = [c for c in ls(f"/api/v1/namespaces/{NS}/configmaps") if c["metadata"]["name"] != "kube-root-ca.crt"]
    sas = [a for a in ls(f"/api/v1/namespaces/{NS}/serviceaccounts") if a["metadata"]["name"] != "default"]
    cm_names = {c["metadata"]["name"] for c in cms}
    sa_names = {a["metadata"]["name"] for a in sas}
    owner = lambda o: (o["metadata"].get("ownerReferences") or [{}])[0].get("name")
    t = {"namespace": NS, "deployments": {}, "replicaSets": {}, "pods": {}, "services": {},
         "configMaps": {}, "serviceAccounts": {}}
    for d in deps:
        spec = d["spec"]["template"]["spec"]
        e = {"replicas": d["spec"]["replicas"], "ready": d["status"].get("readyReplicas", 0),
             "image": spec["containers"][0]["image"]}
        sa = spec.get("serviceAccountName")
        if sa in sa_names:
            e["serviceAccount"] = ref("serviceAccounts", sa)
        vols = [ref("configMaps", v["configMap"]["name"]) for v in spec.get("volumes", [])
                if "configMap" in v and v["configMap"]["name"] in cm_names]
        if vols:
            e["volumes"] = vols
        t["deployments"][d["metadata"]["name"]] = e
    for r in rss:
        t["replicaSets"][r["metadata"]["name"]] = {"replicas": r["spec"]["replicas"],
            "owner": ref("deployments", owner(r))}
    for p in pods:
        cs = (p["status"].get("containerStatuses") or [{}])[0]
        e = {"phase": "Terminating" if p["metadata"].get("deletionTimestamp") else p["status"]["phase"],
             "ready": cs.get("ready", False), "restarts": cs.get("restartCount", 0), "ip": p["status"].get("podIP")}
        if owner(p) in t["replicaSets"]:
            e["owner"] = ref("replicaSets", owner(p))
        t["pods"][p["metadata"]["name"]] = e
    for s in svcs:
        sel = s["spec"].get("selector") or {}
        targets = [ref("pods", p["metadata"]["name"]) for p in pods
                   if sel and all(p["metadata"]["labels"].get(k) == v for k, v in sel.items())]
        t["services"][s["metadata"]["name"]] = {"type": s["spec"]["type"],
            "ports": [x["port"] for x in s["spec"]["ports"]], "targets": targets}
    for c in cms:
        t["configMaps"][c["metadata"]["name"]] = {"files": sorted((c.get("data") or {}).keys())}
    for a in sas:
        t["serviceAccounts"][a["metadata"]["name"]] = {"role": ref("deployments", "api")} if a["metadata"]["name"] == "api" else {}
    return t

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
            elif self.path == "/api/tree":
                self.send(200, cluster_tree())
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
