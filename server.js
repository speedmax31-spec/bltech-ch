// 개인 PMS 로컬 서버 (외부 의존성 없음 - Node 내장 모듈만 사용)
// 데이터를 같은 폴더의 data.json 파일에 실제로 저장합니다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 8765;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data.json");
const BACKUP_DIR = path.join(ROOT, "backups");

function sendJSON(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readTasks() {
  try {
    const j = JSON.parse(fs.readFileSync(DATA, "utf8"));
    return Array.isArray(j.tasks) ? j.tasks : [];
  } catch (e) {
    return [];
  }
}

function writeTasks(tasks) {
  const payload = JSON.stringify(
    { tasks: tasks, updated: new Date().toISOString() },
    null,
    2
  );
  // 안전 저장: 임시 파일에 쓴 뒤 교체 (저장 중 깨짐 방지)
  const tmp = DATA + ".tmp";
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, DATA);
  rotateBackup(payload);
}

// 하루 한 번 백업 스냅샷 보관 (날짜별 1개, 최근 14개 유지)
function rotateBackup(payload) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
    const d = new Date();
    const stamp =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    fs.writeFileSync(path.join(BACKUP_DIR, "data-" + stamp + ".json"), payload, "utf8");
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("data-") && f.endsWith(".json"))
      .sort();
    while (files.length > 14) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    /* 백업 실패는 무시 (저장 자체는 성공) */
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  // ---- API ----
  if (url === "/api/tasks") {
    if (req.method === "GET") {
      return sendJSON(res, 200, { tasks: readTasks() });
    }
    if (req.method === "PUT" || req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 10 * 1024 * 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          const j = JSON.parse(body);
          const tasks = Array.isArray(j.tasks) ? j.tasks : [];
          writeTasks(tasks);
          sendJSON(res, 200, { ok: true, count: tasks.length });
        } catch (e) {
          sendJSON(res, 400, { ok: false, error: String(e) });
        }
      });
      return;
    }
    res.writeHead(405);
    return res.end();
  }

  // ---- 정적 파일 (index.html 등) ----
  let file = url === "/" ? "/index.html" : url;
  const safe = path.normalize(file).replace(/^([.][.][\\/])+/, "");
  const fp = path.join(ROOT, safe);
  if (!fp.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  // data.json / 백업은 정적 노출하지 않음 (API로만 접근)
  if (fp === DATA || fp.startsWith(BACKUP_DIR)) {
    res.writeHead(404);
    return res.end();
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(fp).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log("\n포트 " + PORT + " 가 이미 사용 중입니다.");
    console.log("이미 PMS가 켜져 있을 수 있어요. 브라우저에서 http://localhost:" + PORT + " 를 열어보세요.");
  } else {
    console.log("오류:", e.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = "http://localhost:" + PORT;
  console.log("====================================");
  console.log("  개인 PMS 가 실행되었습니다 ✅");
  console.log("  주소     : " + url);
  console.log("  저장 파일: " + DATA);
  console.log("====================================");
  console.log("브라우저가 자동으로 열립니다.");
  console.log("종료하려면 이 검은 창을 닫으면 됩니다.");
  // 기본 브라우저로 자동 열기 (--no-open 인자나 환경변수가 있으면 생략)
  if (!process.env.PMS_NO_OPEN && process.argv.indexOf("--no-open") === -1) {
    exec('cmd /c start "" "' + url + '"');
  }
});
