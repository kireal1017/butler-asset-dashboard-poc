// 서버 /api 호출. 오류는 서버가 준 한 문장 안내를 그대로 쓴다 (PRD 13장).
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  }
  return data;
}
