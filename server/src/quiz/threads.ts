// 스레드 게시: 이미지 컨테이너를 만든 뒤 게시한다. 정답 부분은 text_entities 스포일러로 가린다
// https://developers.facebook.com/documentation/threads/create-posts/spoilers

const API = 'https://graph.threads.net/v1.0';
const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';
/** 장기 토큰은 60일 동안 유효하다. 게시할 때 7일이 지났으면 미리 갱신한다 */
const REFRESH_AFTER = 7 * 24 * 3600_000;

export interface ThreadsToken {
  token: string;
  refreshedAt: number;
}

async function call(url: string, params: Record<string, string>, method: 'GET' | 'POST' = 'POST') {
  const body = new URLSearchParams(params);
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Threads API ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function refreshIfOld(t: ThreadsToken): Promise<ThreadsToken> {
  if (Date.now() - t.refreshedAt < REFRESH_AFTER) return t;
  const json = await call(REFRESH_URL, { grant_type: 'th_refresh_token', access_token: t.token }, 'GET');
  return { token: String(json.access_token), refreshedAt: Date.now() };
}

export async function postThreads(
  token: string,
  post: { imageUrl: string; text: string; spoiler: { offset: number; length: number } },
): Promise<string> {
  // 오프셋 단위가 문서에 없어서, UTF-16과 코드 포인트 계산이 같은 글자만 쓴다
  if ([...post.text].length !== post.text.length) throw new Error('스레드 본문에 BMP 밖 글자(이모지 등)가 있습니다.');
  const container = await call(`${API}/me/threads`, {
    access_token: token,
    media_type: 'IMAGE',
    image_url: post.imageUrl,
    text: post.text,
    text_entities: JSON.stringify([{ entity_type: 'SPOILER', offset: post.spoiler.offset, length: post.spoiler.length }]),
  });
  // 이미지 처리 시간을 기다린 뒤 게시하라는 공식 안내를 따른다
  await new Promise((r) => setTimeout(r, 30_000));
  const published = await call(`${API}/me/threads_publish`, { access_token: token, creation_id: String(container.id) });
  return String(published.id);
}
