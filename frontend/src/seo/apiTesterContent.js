/**
 * Text for the public API tester page (/playground), shared by the page and
 * its structured data (seo/pages.js) so the FAQ shown and the FAQ in JSON-LD
 * are always the same.
 */

export const API_TESTER_FAQS = [
  {
    q: 'Is the HitAPI online API tester free?',
    a: 'Yes. Every feature on this page is free and needs no account: any HTTP method, headers, Bearer / Basic / API key / OAuth 2.0 auth, JSON, XML, form, file and GraphQL bodies, cURL import and code snippets. Sign in only if you want a higher rate limit.',
  },
  {
    q: 'Can I test an API running on localhost?',
    a: 'Yes. Choose "This browser" to send the request straight from your browser (your API must allow CORS), or install the free HitAPI Chrome extension and choose "HitAPI extension": it reaches localhost and private networks with no CORS limits. HitAPI cloud only reaches public URLs.',
  },
  {
    q: 'Why do I get a CORS error, and how do I avoid it?',
    a: 'Browsers block a web page from reading another site\'s API unless that API sends CORS headers. Send the request with "HitAPI cloud" (it runs on HitAPI\'s servers, where CORS doesn\'t apply) or with the HitAPI extension.',
  },
  {
    q: 'Do you store or log my requests?',
    a: 'No. Your request, its tokens and the response stay in your browser. When you use HitAPI cloud, the request passes through HitAPI\'s servers to reach the API, and its headers, body and response are not stored or logged.',
  },
  {
    q: 'What are the limits?',
    a: 'With HitAPI cloud: 60 requests a minute (300 when signed in), a 15-second timeout, 1 MB request bodies and 2 MB responses, and public URLs only. "This browser" and the HitAPI extension have no HitAPI limits.',
  },
  {
    q: 'Can I paste a cURL command or get code for my request?',
    a: 'Yes. Paste a cURL command (for example from Chrome DevTools "Copy as cURL") into the URL box and the whole request fills in. "Copy as cURL" and "Code" give you the request as cURL, JavaScript fetch, Node.js axios, Python requests, Go or PHP.',
  },
  {
    q: 'Does it work with GraphQL, file uploads and OAuth 2.0?',
    a: 'Yes. Choose GraphQL to send a query with variables, Form data to upload files (multipart), Binary file to send a file as the body, and OAuth 2.0 in the Auth tab: HitAPI gets the access token (client credentials) before the request.',
  },
];

export const API_TESTER_FEATURES = [
  ['Any method', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS and custom methods.'],
  ['Every body type', 'JSON, XML, text, URL-encoded and multipart forms with files, binary files and GraphQL.'],
  ['Auth built in', 'Bearer token, Basic auth, API key in a header or query, custom header and OAuth 2.0.'],
  ['Readable responses', 'Collapsible JSON with search, raw view, HTML / image / PDF preview, headers, cookies and timing.'],
  ['cURL in, code out', 'Paste a cURL command to fill the request; copy it as cURL, fetch, axios, Python, Go or PHP.'],
  ['Localhost too', 'Send from your browser or the HitAPI extension to reach APIs on your machine.'],
];
