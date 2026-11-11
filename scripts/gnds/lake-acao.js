// nsr-lake-acao (brief 70): a CloudFront Function on viewer response for /lake/janis/*. It sets
// Access-Control-Allow-Origin: * on every response, because the managed SimpleCORS response-headers policy leaves the
// header off when the request carries Chromium's "priority" header (found 2026-11-11).
function handler(event) {
  var response = event.response;
  response.headers['access-control-allow-origin'] = { value: '*' };
  return response;
}
