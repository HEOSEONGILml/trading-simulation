// X 게시: OAuth 1.0a 사용자 토큰(만료 없음)으로 이미지를 올리고, 퀴즈 글과 정답 답글을 단다
// https://docs.x.com/x-api/media/upload-media, https://docs.x.com/x-api/posts/create-post

import { createHmac, randomBytes } from 'node:crypto';

const API = 'https://api.x.com/2';

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

function pct(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** JSON 본문은 서명에 넣지 않는다 (OAuth 1.0a는 form 본문만 서명 대상) */
export function oauthHeader(method: string, url: string, c: XCredentials, nonce = randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000)) {
  const params: Record<string, string> = {
    oauth_consumer_key: c.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: c.accessToken,
    oauth_version: '1.0',
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const key = `${pct(c.apiSecret)}&${pct(c.accessSecret)}`;
  params.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return (
    'OAuth ' +
    Object.keys(params)
      .sort()
      .map((k) => `${pct(k)}="${pct(params[k])}"`)
      .join(', ')
  );
}

async function post(url: string, body: unknown, c: XCredentials) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', url, c), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { data?: { id?: string } };
  if (!res.ok || !json.data?.id) throw new Error(`X API ${res.status}: ${JSON.stringify(json)}`);
  return json.data.id;
}

export async function postX(c: XCredentials, p: { png: Buffer; text: string; reply: string }) {
  const mediaId = await post(`${API}/media/upload`, { media: p.png.toString('base64'), media_category: 'tweet_image' }, c);
  const postId = await post(`${API}/tweets`, { text: p.text, media: { media_ids: [mediaId] } }, c);
  const replyId = await post(`${API}/tweets`, { text: p.reply, reply: { in_reply_to_tweet_id: postId } }, c);
  return { postId, replyId };
}
