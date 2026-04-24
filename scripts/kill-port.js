/**
 * scripts/kill-port.js
 * 지정한 포트를 점유하는 프로세스를 종료.
 * PowerShell / cmd 양쪽에서 동작.
 * Usage: node scripts/kill-port.js 5173
 */
const { execSync } = require('child_process')

const port = process.argv[2] || '5173'

try {
  if (process.platform === 'win32') {
    // netstat 결과에서 PID 추출 후 종료
    const result = execSync(
      `netstat -aon | findstr :${port}`,
      { encoding: 'utf-8', shell: 'cmd.exe' }
    )
    const lines = result.split('\n').filter(Boolean)
    const killed = new Set()

    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== '0' && !killed.has(pid)) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { shell: 'cmd.exe', stdio: 'ignore' })
          console.log(`  [OK] Killed PID ${pid} on port ${port}`)
          killed.add(pid)
        } catch (_) {
          // 이미 죽은 프로세스
        }
      }
    }

    if (killed.size === 0) {
      console.log(`  [OK] Port ${port} is free.`)
    }
  } else {
    // Linux / macOS
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`)
    console.log(`  [OK] Port ${port} cleared.`)
  }
} catch (_) {
  // 포트 사용 중이 아님 — 정상
  console.log(`  [OK] Port ${port} is free.`)
}
