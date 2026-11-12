/**
 * Text shared by the /mock-api-server page and its structured data (seo/pages.js),
 * so the FAQ markup always matches what visitors see.
 */

export const MOCK_FAQS = [
    {
        q: 'Is the HitAPI mock server free?',
        a: 'Yes. Creating mock servers, generating mock data from your spec and calling your mock URLs are free with a HitAPI account. The demo mock server on this page needs no account at all.',
    },
    {
        q: 'Do the apps calling my mock need to log in?',
        a: 'No. A mock URL works without a token or API key, and CORS is open, so a web app, mobile app, Postman or a CI job can call it directly. You need to be signed in to HitAPI only to create, edit or turn off a mock server.',
    },
    {
        q: 'How do I keep a mock server private?',
        a: 'Each mock URL contains a random ID that is not practical to guess; share it only with your team. You can turn a mock off at any time (calls then get a 503), and regenerating it gives it a new URL.',
    },
    {
        q: 'Where does the mock data come from?',
        a: 'From your OpenAPI or Swagger spec. If a response has an example, the example is returned. Otherwise HitAPI builds realistic data from the response schema, using field names, formats, enums and min/max limits. Endpoints with no response described get a sensible generic body. You can then ask AI to make any response more realistic, or edit it by hand.',
    },
    {
        q: 'Does the mock remember data I POST to it?',
        a: 'No. HitAPI mocks are stateless: a POST returns the response for that route (usually 201 with a sample object) but does not change what a later GET returns. This keeps every response predictable for frontend work and tests.',
    },
    {
        q: 'Can I test error responses?',
        a: 'Yes. Send the header X-Mock-Status: 404 (or any 4xx or 5xx code), or add ?__status=500 to the URL, and the mock returns that error. You can also edit a route to always return an error, or add a delay of up to 10 seconds to test loading states.',
    },
    {
        q: 'I have no OpenAPI spec. Can I still create a mock?',
        a: 'Yes. Capture your API calls with the HitAPI Chrome extension or add endpoints by hand; HitAPI builds a mock for each one and fills in generic data that you can improve with AI or edit.',
    },
];
