# 카카오톡 나에게 보내기 1차 연동 가이드

## 목표

사업자등록증이나 카카오 비즈니스 채널 승인 없이, 카드뉴스 요약을 내 카카오톡 `나와의 채팅방`으로 먼저 받는 1차 연동을 진행한다.

이 방식은 카카오 Developers의 `카카오톡 메시지 > 나에게 보내기` API를 사용한다. 공식 문서 기준으로 다른 사람에게 보내는 기능은 아니며, 로그인한 사용자 본인의 `나와의 채팅방`으로만 전송된다.

## 공식 기준

- 카카오톡 메시지 REST API 문서: https://developers.kakao.com/docs/latest/ko/kakaotalk-message/rest-api
- 카카오 로그인 REST API 문서: https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api
- 나에게 기본 템플릿 발송 API:
  - `POST https://kapi.kakao.com/v2/api/talk/memo/default/send`
  - 인증: `Authorization: Bearer ${ACCESS_TOKEN}`
  - 본문: `application/x-www-form-urlencoded;charset=utf-8`
  - 필수 동의항목: `talk_message`

## 1차 적용 범위

1차에서는 다음까지만 진행한다.

- 카드뉴스 내용을 텍스트/피드 템플릿으로 구성한다.
- 카카오 Developers 앱을 생성하고 카카오 로그인을 활성화한다.
- `talk_message` 동의항목을 설정한다.
- 사용자 본인 계정으로 OAuth 동의 후 액세스 토큰을 발급한다.
- 발급받은 액세스 토큰으로 `나에게 보내기` API를 호출한다.

1차에서는 다음은 제외한다.

- 다른 사용자, 친구, 채널 구독자에게 발송
- 알림톡/친구톡 발송
- 사업자 인증 기반 카카오 비즈니스 채널 발송
- 유료 발송 대행사 연동

## 카카오 Developers 설정 순서

1. 카카오 Developers 콘솔에 로그인한다.
   - https://developers.kakao.com/console/app
2. 애플리케이션을 생성한다.
   - 예시 앱 이름: `PAT Market Brief`
3. 앱 키에서 `REST API 키`를 확인한다.
4. `카카오 로그인`을 활성화한다.
5. Redirect URI를 등록한다.
   - 로컬 테스트 예시: `http://localhost:8766/oauth/kakao`
   - 실제 운영 시에는 HTTPS 주소로 교체한다.
6. 동의항목에서 `카카오톡 메시지 전송(talk_message)`을 설정한다.
7. 인가 코드 요청 URL로 접속해 본인 계정으로 동의한다.

## 인가 코드 요청 URL 형식

```text
https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${KAKAO_REST_API_KEY}&redirect_uri=${KAKAO_REDIRECT_URI}&scope=talk_message
```

주의:

- `${KAKAO_REDIRECT_URI}`는 카카오 Developers 콘솔에 등록된 Redirect URI와 정확히 일치해야 한다.
- 발급된 `code`는 1회용이다.
- 토큰과 앱 키는 문서, Git, 실행내역서에 저장하지 않는다.

## 토큰 발급 요청

```bash
curl -X POST "https://kauth.kakao.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" \
  -d "grant_type=authorization_code" \
  -d "client_id=${KAKAO_REST_API_KEY}" \
  -d "redirect_uri=${KAKAO_REDIRECT_URI}" \
  -d "code=${KAKAO_AUTHORIZE_CODE}"
```

응답에서 필요한 값:

- `access_token`: 나에게 보내기 호출에 사용
- `refresh_token`: 액세스 토큰 갱신에 사용
- `expires_in`: 액세스 토큰 만료 시간

## 나에게 보내기 요청 예시

```bash
curl -X POST "https://kapi.kakao.com/v2/api/talk/memo/default/send" \
  -H "Content-Type: application/x-www-form-urlencoded;charset=utf-8" \
  -H "Authorization: Bearer ${KAKAO_ACCESS_TOKEN}" \
  --data-urlencode 'template_object={
    "object_type": "feed",
    "content": {
      "title": "미국증시 장 마감 브리핑",
      "description": "AI 반도체와 서버 인프라 관련 특징주 흐름을 점검하고, 국내 증시 영향과 한국 연관 종목 10개를 정리했습니다.",
      "image_url": "https://example.com/pat-card-news-cover.png",
      "image_width": 800,
      "image_height": 800,
      "link": {
        "web_url": "https://example.com/pat-market-brief",
        "mobile_web_url": "https://example.com/pat-market-brief"
      }
    },
    "buttons": [
      {
        "title": "브리핑 보기",
        "link": {
          "web_url": "https://example.com/pat-market-brief",
          "mobile_web_url": "https://example.com/pat-market-brief"
        }
      }
    ]
  }'
```

## 카드뉴스 이미지 처리

카카오 메시지의 `image_url`은 카카오톡에서 접근 가능한 공개 URL이어야 한다. 로컬 PC의 이미지 파일 경로는 그대로 보낼 수 없다.

1차 추천 방식:

- 먼저 텍스트/피드 메시지로 나에게 보내기를 검증한다.
- 이후 카드뉴스 이미지를 공개 접근 가능한 저장소에 올린다.
- 이미지 URL을 `image_url`에 넣어 피드 템플릿으로 보낸다.

## 카드뉴스 메시지 초안

```text
미국증시 장 마감 브리핑

핵심:
AI 반도체, 서버 인프라, 대형 기술주 흐름을 기준으로 국내 증시에 미칠 영향을 점검합니다.

특징주 분석:
- 상승 종목: 상승 배경, 실적/가이던스/수급/업종 재평가 여부
- 하락 종목: 차익실현, 금리, 규제, 실적 우려 여부

한국 연관 관찰 종목:
삼성전자, SK하이닉스, 한미반도체, 이수페타시스, 대덕전자, 리노공업, ISC, HPSP, 원익IPS, 테크윙

고지:
투자 권유가 아닌 시장 정보 및 학습용 정리입니다.
```

## 환경변수 초안

```text
KAKAO_REST_API_KEY=
KAKAO_REDIRECT_URI=http://localhost:8766/oauth/kakao
KAKAO_ACCESS_TOKEN=
KAKAO_REFRESH_TOKEN=
KAKAO_TOKEN_EXPIRES_AT=
```

보안 원칙:

- 실제 값은 `.env` 또는 별도 비밀 저장소에만 둔다.
- Git, 문서, 실행내역서, Claude 인수인계 문서에는 실제 값을 기록하지 않는다.
- 토큰이 채팅이나 로그에 노출되면 즉시 폐기하고 재발급한다.

## Claude Code 다음 작업

1. 카카오 Developers 앱 생성 여부와 Redirect URI를 확인한다.
2. `talk_message` 동의항목 설정 여부를 확인한다.
3. 로컬 OAuth 콜백 서버를 만들거나 기존 OAuth 서버에 `/oauth/kakao`를 추가한다.
4. 토큰 발급 및 갱신 로직을 구현한다.
5. 카드뉴스 생성 결과를 피드 템플릿 JSON으로 변환한다.
6. `나에게 보내기` API 호출 결과 `result_code: 0`을 검증한다.
