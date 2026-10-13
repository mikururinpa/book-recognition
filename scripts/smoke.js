'use strict';

/**
 * 接口冒烟自测：node scripts/smoke.js [baseUrl]
 * 覆盖注册 / 登录 / me / 收藏增删查 / 图书查询 / 退出
 */
const BASE = (process.argv[2] || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  const account = `smoke_${Date.now()}`;
  const password = 'abc123456';
  console.log(`冒烟测试目标：${BASE}`);
  console.log(`测试账号：${account}`);

  console.log('\n[1] 健康检查');
  const health = await call('GET', '/api/health');
  check('GET /api/health -> ok', health.json && health.json.ok === true, JSON.stringify(health.json));
  check('数据库已连接', health.json && health.json.data && health.json.data.db === 'connected');

  console.log('\n[2] 注册 / 参数校验');
  const badRegister = await call('POST', '/api/auth/register', {
    body: { account, password: '123' },
  });
  check('密码过短被拒', badRegister.json && badRegister.json.ok === false, JSON.stringify(badRegister.json));

  const register = await call('POST', '/api/auth/register', { body: { account, password } });
  check('注册成功', register.json && register.json.ok === true, JSON.stringify(register.json));
  check('返回 account', register.json && register.json.data && register.json.data.account === account);

  const dup = await call('POST', '/api/auth/register', { body: { account, password } });
  check('重复注册被拒', dup.json && dup.json.ok === false, JSON.stringify(dup.json));

  console.log('\n[3] 登录');
  const wrong = await call('POST', '/api/auth/login', { body: { account, password: 'wrongpass' } });
  check('错误密码返回 ok:false', wrong.json && wrong.json.ok === false, JSON.stringify(wrong.json));

  const login = await call('POST', '/api/auth/login', { body: { account, password } });
  check('登录成功', login.json && login.json.ok === true, JSON.stringify(login.json));
  const token = login.json && login.json.data && login.json.data.token;
  check('返回 token', Boolean(token));

  console.log('\n[4] 当前用户 / 鉴权');
  const me = await call('GET', '/api/auth/me', { token });
  check('GET /api/auth/me 成功', me.json && me.json.ok === true, JSON.stringify(me.json));
  check('account 一致', me.json && me.json.data && me.json.data.account === account);

  const noToken = await call('GET', '/api/favorites');
  check('无 token 返回 401', noToken.status === 401, `status=${noToken.status}`);

  const badToken = await call('GET', '/api/auth/me', { token: 'not-a-token' });
  check('伪造 token 返回 401', badToken.status === 401, `status=${badToken.status}`);

  console.log('\n[5] 图书查询');
  const badIsbn = await call('GET', '/api/book/abc');
  check('非法 ISBN 返回 ok:false', badIsbn.json && badIsbn.json.ok === false, JSON.stringify(badIsbn.json));

  const queryForm = await call('GET', '/api/book?isbn=9787576358629');
  check('查询接口可用（?isbn= 形式）', queryForm.json && typeof queryForm.json.ok === 'boolean');
  if (queryForm.json && queryForm.json.ok) {
    check('返回 title', Boolean(queryForm.json.data.title), JSON.stringify(queryForm.json.data));
  } else {
    console.log(`    （第三方无数据，返回：${queryForm.json && queryForm.json.message}）`);
  }

  console.log('\n[6] 收藏');
  const emptyList = await call('GET', '/api/favorites', { token });
  check('初始列表为空', emptyList.json && Array.isArray(emptyList.json.data) && emptyList.json.data.length === 0);

  const add = await call('POST', '/api/favorites', {
    token,
    body: { isbn: '9787576358629', title: '2027张宇考研数学基础30讲', author: '', publisher: '', cover: '' },
  });
  check('添加收藏成功', add.json && add.json.ok === true, JSON.stringify(add.json));

  const addAgain = await call('POST', '/api/favorites', {
    token,
    body: { isbn: '9787576358629', title: '重复收藏', author: '', publisher: '', cover: '' },
  });
  check('重复收藏幂等', addAgain.json && addAgain.json.ok === true, JSON.stringify(addAgain.json));

  await call('POST', '/api/favorites', {
    token,
    body: { isbn: '9787115428028', title: 'ISBN xxxxx', author: '', publisher: '', cover: '' },
  });

  const list = await call('GET', '/api/favorites', { token });
  const items = (list.json && list.json.data) || [];
  check('列表返回 2 条', items.length === 2, `实际 ${items.length}`);
  check(
    '按 savedAt 倒序',
    items.length === 2 && items[0].savedAt >= items[1].savedAt,
    JSON.stringify(items.map((i) => i.savedAt))
  );
  check('空字段兼容', items.some((i) => i.author === '' && i.cover === ''));

  const del = await call('DELETE', '/api/favorites/9787576358629', { token });
  check('取消收藏成功', del.json && del.json.ok === true, JSON.stringify(del.json));

  const delAgain = await call('DELETE', '/api/favorites/9787576358629', { token });
  check('重复取消幂等', delAgain.json && delAgain.json.ok === true, JSON.stringify(delAgain.json));

  const list2 = await call('GET', '/api/favorites', { token });
  const items2 = (list2.json && list2.json.data) || [];
  check('取消后剩余 1 条', items2.length === 1, JSON.stringify(list2.json));

  console.log('\n[7] 退出登录');
  const logout = await call('POST', '/api/auth/logout', { token });
  check('退出成功', logout.json && logout.json.ok === true, JSON.stringify(logout.json));
  const afterLogout = await call('GET', '/api/auth/me', { token });
  check('退出后 token 失效 401', afterLogout.status === 401, `status=${afterLogout.status}`);

  console.log(`\n结果：通过 ${passed} 项，失败 ${failed} 项`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err);
  process.exit(1);
});
