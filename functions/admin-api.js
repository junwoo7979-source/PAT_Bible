// ====== PAT Bible — admin-api.js ======
// 플랫폼 관리자 전용 보호 API. 매 요청마다 Firebase ID 토큰 + Custom Claim(admin===true)을
// 서버에서 재검증한다. 클라이언트 SDK로는 절대 수행하면 안 되는 회원 관리 작업을 담당.
//
// 엔드포인트(onRequest, us-central1):
//   - listUsers        GET   ?q=&status=&limit=   회원 목록(민감정보 제외)
//   - getUser          GET   ?uid=                회원 상세
//   - updateUserStatus POST  { uid, status }      활성/정지 상태 변경
//
// 보안:
//   - Authorization: Bearer <Firebase ID Token> 필수
//   - verifyIdToken 실패 → 401 / admin claim 없음 → 403
//   - 입력값 검증, 허용된 작업만 수행, 오류는 일관된 코드로만 반환(민감정보 미노출)
//   - 관리자 자신 계정 정지 방지(자물쇠). Custom Claim 변경 기능은 이 버전에서 제외.
//   ※ App Check 적용 가능: onRequest 옵션에 enforceAppCheck 및 클라 App Check 초기화 추가(문서 참조).

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const REGION = 'us-central1';

function db() { return getFirestore(); }

// Bearer 토큰 → 관리자 검증. 실패 시 응답을 보내고 null 반환.
async function requireAdmin(req, res) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(String(h));
  if (!m) { res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return null; }
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(m[1], true);
  } catch (e) {
    res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
    return null;
  }
  if (decoded.admin !== true) {
    res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    return null;
  }
  return decoded;
}

function toIso(ts) {
  try { return ts && ts.toDate ? ts.toDate().toISOString() : null; } catch (e) { return null; }
}

// Firestore users 문서 → 안전한 공개 형태(민감필드 제거)
function publicUser(id, u) {
  return {
    uid: u.uid || id,
    email: u.email || '',
    displayName: u.displayName || '',
    role: u.role || 'user',
    status: u.status || 'active',
    emailVerified: !!u.emailVerified,
    createdAt: toIso(u.createdAt),
    updatedAt: toIso(u.updatedAt),
    lastLoginAt: toIso(u.lastLoginAt),
  };
}

const listUsers = onRequest({ cors: true, region: REGION }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const limit = Math.min(Math.max(parseInt((req.query && req.query.limit) || '50', 10) || 50, 1), 200);
    const q = String((req.query && req.query.q) || '').trim().toLowerCase();
    const statusFilter = String((req.query && req.query.status) || '').trim();

    let ref = db().collection('users');
    try { ref = ref.orderBy('createdAt', 'desc'); } catch (e) {}
    const snap = await ref.limit(limit).get();
    let users = snap.docs.map((d) => publicUser(d.id, d.data()));

    if (q) users = users.filter((u) => (u.email && u.email.toLowerCase().includes(q)) || (u.displayName && u.displayName.toLowerCase().includes(q)));
    if (statusFilter) users = users.filter((u) => u.status === statusFilter);

    res.json({ ok: true, count: users.length, users });
  } catch (e) {
    console.error('[PAT admin-api] listUsers:', e.message);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

const getUser = onRequest({ cors: true, region: REGION }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const uid = String((req.query && req.query.uid) || '').trim();
    if (!uid) { res.status(400).json({ ok: false, error: 'UID_REQUIRED' }); return; }
    const doc = await db().collection('users').doc(uid).get();
    if (!doc.exists) { res.status(404).json({ ok: false, error: 'NOT_FOUND' }); return; }
    res.json({ ok: true, user: publicUser(doc.id, doc.data()) });
  } catch (e) {
    console.error('[PAT admin-api] getUser:', e.message);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

const ALLOWED_STATUS = ['active', 'suspended'];

const updateUserStatus = onRequest({ cors: true, region: REGION }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST_REQUIRED' }); return; }
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const body = req.body || {};
    const uid = String(body.uid || '').trim();
    const status = String(body.status || '').trim();
    if (!uid) { res.status(400).json({ ok: false, error: 'UID_REQUIRED' }); return; }
    if (!ALLOWED_STATUS.includes(status)) { res.status(400).json({ ok: false, error: 'INVALID_STATUS' }); return; }

    // ★ 자물쇠: 관리자 자신 계정은 정지할 수 없음(실수 방지)
    if (uid === admin.uid && status === 'suspended') {
      res.status(400).json({ ok: false, error: 'CANNOT_SUSPEND_SELF' });
      return;
    }

    const ref = db().collection('users').doc(uid);
    const doc = await ref.get();
    if (!doc.exists) { res.status(404).json({ ok: false, error: 'NOT_FOUND' }); return; }

    await ref.update({ status: status, updatedAt: FieldValue.serverTimestamp() });
    const after = await ref.get();
    res.json({ ok: true, user: publicUser(after.id, after.data()) });
  } catch (e) {
    console.error('[PAT admin-api] updateUserStatus:', e.message);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = { listUsers, getUser, updateUserStatus, requireAdmin, publicUser };
