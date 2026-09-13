import { useState, useEffect, useRef } from 'react';
import { api } from '../../../store/index.js';
import {
    ChevronRight, ChevronLeft, Check,
    Lock,
} from 'lucide-react';
import { useAuthDetector } from '../hooks/useAuthDetector.js';
import { useEndpointGroups } from '../hooks/useEndpointGroups.js';
import { StepAuthConfig } from './StepAuthConfig.jsx';
import { StepCrudGroups } from './StepCrudGroups.jsx';
import { Label, Input, EndpointPicker, safeJSON } from './Helpers.jsx'

// Auto-growing textarea for JSON bodies. Declared at MODULE scope (not inside
// SmartWizard) so React sees a stable component identity across renders —
// otherwise every keystroke would remount it and drop focus.
function AutoTextarea({ value, onFocus, onChange, error, minHeight = 44, maxHeight = 260, ...rest }) {
    const taRef = useRef(null);
    useEffect(() => {
        const el = taRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight) + 'px';
    }, [value]);
    return (
        <textarea
            ref={taRef}
            value={value}
            onFocus={onFocus}
            onChange={onChange}
            spellCheck={false}
            style={{
                width: '100%',
                minHeight,
                maxHeight,
                overflow: 'auto',
                resize: 'vertical',
                boxSizing: 'border-box',
                padding: '9px 10px',
                borderRadius: 6,
                border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                lineHeight: 1.5,
                outline: 'none',
            }}
            {...rest}
        />
    );
}

export function SmartWizard({ projectId, endpoints, onCreated, onClose }) {
    const [step, setStep] = useState(1);
    const ALL_STEPS = [
        { key: 'auth_method', label: 'Authentication method' },
        { key: 'signup', label: 'Pick signup endpoint', flowOnly: true },
        { key: 'login', label: 'Pick login endpoint', flowOnly: true },
        { key: 'token', label: 'Token extraction', flowOnly: true },
        { key: 'endpoints', label: 'Select endpoints' },
        { key: 'auth_config', label: 'Auth configuration' },
        { key: 'crud', label: 'CRUD groups' },
        { key: 'review', label: 'Review & create' },
    ];

    // Existing wizard state (unchanged)
    const [signupId, setSignupId] = useState(null);
    const [loginId, setLoginId] = useState(null);
    const [tokenPath, setTokenPath] = useState('token');
    const [customToken, setCustomToken] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [suiteName, setSuiteName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [authType, setAuthType] = useState('flow'); // 'flow' | 'static' | 'none'
    const [staticToken, setStaticToken] = useState('');
    const activeSteps = ALL_STEPS.filter(s => !s.flowOnly || authType === 'flow');
    const TOTAL = activeSteps.length;
    const STEP_LABELS = activeSteps.map(s => s.label);
    const currentStepKey = activeSteps[step - 1]?.key;
    const [aiOverrides, setAiOverrides] = useState({});
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });
    const [requestBodyOverrides, setRequestBodyOverrides] = useState({});
    const [requestBodyText, setRequestBodyText] = useState({});
    const [requestBodyErrors, setRequestBodyErrors] = useState({});
    const [testCaseBodyOverrides, setTestCaseBodyOverrides] = useState({});
    const [testCaseBodyText, setTestCaseBodyText] = useState({});
    const [testCaseBodyErrors, setTestCaseBodyErrors] = useState({});
    const [expandedReviewSteps, setExpandedReviewSteps] = useState(new Set());
    const [savedRequestBodies, setSavedRequestBodies] = useState(new Set());
    const reviewCardRefs = useRef({});
    // NEW: auth detection hook
    const { annotated, toggleAuth, authCount, publicCount } = useAuthDetector(endpoints);

    // NEW: CRUD groups hook — uses annotated endpoints so auth overrides flow through
    const { groups, getGroupConfig, toggleGroup, setIdPath, buildCrudSteps,
        excludeEndpoint, moveEndpoint, resetEndpoint,
        endpointOverrides, excludedEndpoints } = useEndpointGroups(annotated);

    // Auto-detect on mount
    useEffect(() => {
        const signup = endpoints.find(e => e.method === 'POST' &&
            (e.path.toLowerCase().includes('signup') || e.path.toLowerCase().includes('register')));
        const login = endpoints.find(e => e.method === 'POST' &&
            (e.path.toLowerCase().includes('login') || e.path.toLowerCase().includes('signin') || e.path.toLowerCase().includes('token')));
        if (signup) setSignupId(signup.id);
        if (login) setLoginId(login.id);

        // Pre-select secured endpoints
        const secured = endpoints.filter(e => {
            if (!e.security) return false;
            try { const s = JSON.parse(e.security); return Array.isArray(s) && s.length > 0; }
            catch { return false; }
        }).filter(e => e.id !== signup?.id && e.id !== login?.id);
        setSelected(new Set(secured.map(e => e.id)));

        // Default suite name
        setSuiteName('Full Auth Flow');
    }, []);

    const [reviewSteps, setReviewSteps] = useState([]);

    // Build preview steps when entering step 7
    useEffect(() => {
        if (currentStepKey !== 'review') return;
        const preview = [];
        let order = 1;

        // Only include signup/login if authType === 'flow'
        if (authType === 'flow' && signupId) {
            const ep = endpoints.find(e => e.id === signupId);
            preview.push({ order: order++, name: 'Sign up', method: 'POST', path: ep?.path || '', color: 'var(--green)', fixed: true });
        }
        if (authType === 'flow' && loginId) {
            const ep = endpoints.find(e => e.id === loginId);
            preview.push({ order: order++, name: 'Login', method: 'POST', path: ep?.path || '', color: 'var(--accent)', fixed: true });
        }

        const crudEndpointIds = new Set(
            groups.filter(g => getGroupConfig(g.basePath).included).flatMap(g => g.endpoints.map(e => e.id))
        );

        for (const id of selected) {
            const ep = endpoints.find(e => e.id === id);
            if (!ep) continue;
            if (crudEndpointIds.has(id)) continue;
            if (id === signupId || id === loginId) continue;
            preview.push({ order: order++, name: `${ep.method} ${ep.path}`, method: ep.method, path: ep.path, color: 'var(--amber)', endpointId: id });
        }
        const crudSteps = buildCrudSteps(order);
        crudSteps.forEach(s => {
            preview.push({ order: order++, name: s.name, method: s.method, path: s.name.split(' ').slice(1).join(' '), color: 'var(--blue)', crudStep: s });
        });
        setReviewSteps(preview);

        generateAllPayloadsWithAI(preview)
    }, [currentStepKey]);


    async function generateAllPayloadsWithAI(previewSteps) {
        const targets = previewSteps
            .map((step, i) => ({ step, i }))
            .filter(({ step }) => {
                if (step.fixed) return false;
                const method = step.crudStep?.method || step.method;
                const endpointId = step.crudStep?.endpoint_id || step.endpointId;
                return endpointId && ['POST', 'PUT', 'PATCH'].includes(method);
            });

        if (!targets.length) return;

        setGeneratingAI(true);
        setAiProgress({ done: 0, total: targets.length });

        for (const { step, i } of targets) {
            const endpointId = step.crudStep?.endpoint_id || step.endpointId;
            try {
                const result = await api.flows.generateStep(
                    projectId,
                    endpointId
                );

                const cases = normalizeGeneratedCases(result);

                setAiOverrides(prev => ({
                    ...prev,
                    [endpointId]: cases
                }));

            } catch (err) {
                console.warn(`AI generation failed for step ${i}:`, err.message);
            }
            setAiProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }

        setGeneratingAI(false);
    }

    function normalizeGeneratedCases(result) {
        let value = result?.data ?? result;

        // Raw LLM response
        if (value?.choices?.[0]?.text) {
            value = value.choices[0].text;
        }

        // JSON string
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {
                return [];
            }
        }

        if (Array.isArray(value)) {
            return value;
        }

        if (Array.isArray(value?.cases)) {
            return value.cases;
        }

        if (Array.isArray(value?.data)) {
            return value.data;
        }

        return [];
    }
    function guardedClose() {
        if (generatingAI) {
            addToast?.('⏳ Please wait — generating request bodies with AI', 'info');
            return;
        }
        onClose();
    }

    function getTestCaseKey(endpointId, caseIndex) {
        return `${endpointId}:${caseIndex}`;
    }
    function getAiCasePayload(aiCase) {
        return aiCase?.input_payload ??
            aiCase?.request_body ??
            null;
    }
    function getTestCaseBody(endpointId, caseIndex, aiCase) {
        const key = getTestCaseKey(endpointId, caseIndex);

        if (testCaseBodyOverrides[key] !== undefined) {
            return testCaseBodyOverrides[key];
        }

        return getAiCasePayload(aiCase);
    }
    function startEditingTestCaseBody(endpointId, caseIndex, aiCase) {
        const key = getTestCaseKey(endpointId, caseIndex);

        const body = getTestCaseBody(
            endpointId,
            caseIndex,
            aiCase
        );

        setTestCaseBodyText(prev => ({
            ...prev,
            [key]: body == null
                ? ''
                : JSON.stringify(body, null, 2)
        }));

        setTestCaseBodyErrors(prev => ({
            ...prev,
            [key]: ''
        }));
    }

    function updateTestCaseBodyText(endpointId, caseIndex, value) {
        const key = getTestCaseKey(endpointId, caseIndex);

        setTestCaseBodyText(prev => ({
            ...prev,
            [key]: value
        }));

        setTestCaseBodyErrors(prev => ({
            ...prev,
            [key]: ''
        }));
    }

    function saveTestCaseBody(endpointId, caseIndex) {
        const key = getTestCaseKey(endpointId, caseIndex);
        const text = testCaseBodyText[key];

        if (!text?.trim()) {
            setTestCaseBodyErrors(prev => ({
                ...prev,
                [key]: 'Request body cannot be empty.'
            }));
            return;
        }

        try {
            const parsed = JSON.parse(text);

            if (
                parsed === null ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                throw new Error('Request body must be a JSON object.');
            }

            setTestCaseBodyOverrides(prev => ({
                ...prev,
                [key]: parsed
            }));

            setTestCaseBodyErrors(prev => ({
                ...prev,
                [key]: ''
            }));

        } catch (err) {
            setTestCaseBodyErrors(prev => ({
                ...prev,
                [key]: err.message || 'Invalid JSON'
            }));
        }
    }
    function getRequestBodyForEndpoint(endpointId) {
        if (requestBodyOverrides[endpointId] !== undefined) {
            return requestBodyOverrides[endpointId];
        }

        if (aiOverrides[endpointId]?.input_payload !== undefined) {
            return aiOverrides[endpointId].input_payload;
        }

        const ep = endpoints.find(e => e.id === endpointId);
        if (!ep) return null;

        const schema = safeJSON(ep.request_body);

        return schema?._example ||
            (schema?.properties
                ? buildPayload(
                    Object.keys(schema.properties),
                    ep.path
                )
                : {});
    }

    function getEndpointForReviewStep(step) {
        const endpointId =
            step.crudStep?.endpoint_id ||
            step.endpointId;

        if (!endpointId) return null;

        return endpoints.find(e => e.id === endpointId);
    }

    function getAiCasesForEndpoint(endpointId) {
        const value = aiOverrides[endpointId];

        if (!value) return [];

        // AI may return:
        // [{...}]
        // { data: [{...}] }
        // { cases: [{...}] }
        // { input_payload: {...} }

        if (Array.isArray(value)) {
            return value;
        }

        if (Array.isArray(value?.data)) {
            return value.data;
        }

        if (Array.isArray(value?.cases)) {
            return value.cases;
        }

        if (value?.input_payload !== undefined) {
            return [value];
        }

        return [];
    }

    function getReviewRequestBody(step) {
        const endpointId =
            step.crudStep?.endpoint_id ||
            step.endpointId;

        if (!endpointId) return null;

        return getRequestBodyForEndpoint(endpointId);
    }

    function getRequestBodyText(step) {
        const endpointId =
            step.crudStep?.endpoint_id ||
            step.endpointId;

        if (!endpointId) return '';

        if (requestBodyText[endpointId] !== undefined) {
            return requestBodyText[endpointId];
        }

        const body = getReviewRequestBody(step);

        if (body === null || body === undefined) {
            return '';
        }

        try {
            return JSON.stringify(body, null, 2);
        } catch {
            return '';
        }
    }

    function startEditingRequestBody(step) {
        const endpointId =
            step.crudStep?.endpoint_id ||
            step.endpointId;

        if (!endpointId) return;

        const body = getReviewRequestBody(step);

        setRequestBodyText(prev => ({
            ...prev,
            [endpointId]: body == null
                ? ''
                : JSON.stringify(body, null, 2)
        }));

        setRequestBodyErrors(prev => ({
            ...prev,
            [endpointId]: ''
        }));
    }

    function updateRequestBodyText(endpointId, value) {
        setRequestBodyText(prev => ({
            ...prev,
            [endpointId]: value
        }));

        setRequestBodyErrors(prev => ({
            ...prev,
            [endpointId]: ''
        }));

        setSavedRequestBodies(prev => {
            const next = new Set(prev);
            next.delete(endpointId);
            return next;
        });
    }


    function saveRequestBody(endpointId) {
        const text = requestBodyText[endpointId];

        if (!text?.trim()) {
            setRequestBodyErrors(prev => ({
                ...prev,
                [endpointId]: 'Request body cannot be empty.'
            }));
            return;
        }

        try {
            const parsed = JSON.parse(text);

            if (
                parsed === null ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                throw new Error('Request body must be a JSON object.');
            }

            setRequestBodyOverrides(prev => ({
                ...prev,
                [endpointId]: parsed
            }));

            setRequestBodyErrors(prev => ({
                ...prev,
                [endpointId]: ''
            }));

            setSavedRequestBodies(prev => {
                const next = new Set(prev);
                next.add(endpointId);
                return next;
            });

        } catch (err) {
            setRequestBodyErrors(prev => ({
                ...prev,
                [endpointId]: err.message || 'Invalid JSON'
            }));
        }
    }

    function toggleReviewStep(index) {
        setExpandedReviewSteps(prev => {
            const next = new Set(prev);

            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }

            return next;
        });
    }



    function moveReviewStep(idx, dir) {
        setReviewSteps(prev => {
            const next = [...prev];
            const swap = idx + dir;
            if (swap < 0 || swap >= next.length) return prev;
            // Don't move fixed steps (signup/login)
            if (next[idx].fixed || next[swap].fixed) return prev;
            [next[idx], next[swap]] = [next[swap], next[idx]];
            return next.map((s, i) => ({ ...s, order: i + 1 }));
        });
    }


    const signupEp = endpoints.find(e => e.id === signupId);
    const loginEp = endpoints.find(e => e.id === loginId);
    const otherEps = endpoints.filter(e => e.id !== signupId && e.id !== loginId);

    function toggleEndpoint(id) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function handleCreate() {
        // Only require login/signup when using the flow auth method
        if (authType === 'flow' && !loginId && !signupId) {
            setError('Select at least a login or signup endpoint');
            return;
        }
        if (authType === 'static' && !staticToken.trim()) {
            setError('Enter a static token, or go back and pick a different auth method');
            return;
        }

        // Count total steps before creating
        const crudStepCount = buildCrudSteps(1).length;
        const totalSteps = (authType === 'flow' ? (signupId ? 1 : 0) + (loginId ? 1 : 0) : 0) + selected.size + crudStepCount;
        const MAX_STEPS = 100;
        if (totalSteps > MAX_STEPS) {
            setError(`Too many steps (${totalSteps}). Maximum is ${MAX_STEPS}.`);
            return;
        }

        setCreating(true);
        setError('');
        try {
            const finalTokenPath = tokenPath === 'custom' ? customToken : tokenPath;

            let finalSteps = [];
            let finalOrder = 1;

            for (const rs of reviewSteps) {

                // -----------------------------------------
                // CRUD step
                // -----------------------------------------
                if (rs.crudStep) {
                    const crudEndpointId = rs.crudStep.endpoint_id;
                    const crudAiCases = crudEndpointId ? getAiCasesForEndpoint(crudEndpointId) : [];

                    // If AI generated cases for this endpoint (POST/PUT/PATCH only —
                    // GET/DELETE never get cases from generateAllPayloadsWithAI),
                    // expand into one step per case, same as the plain-endpoint path below.
                    if (crudAiCases.length > 0 && ['POST', 'PUT', 'PATCH'].includes(rs.crudStep.method)) {
                        crudAiCases.forEach((aiCase, caseIndex) => {
                            const caseKey = getTestCaseKey(crudEndpointId, caseIndex);
                            const editedBody = testCaseBodyOverrides[caseKey];
                            const generatedBody = getAiCasePayload(aiCase);
                            const inputPayload = editedBody !== undefined ? editedBody : generatedBody;

                            finalSteps.push({
                                ...rs.crudStep,
                                step_order: finalOrder++,
                                name: aiCase.name || rs.crudStep.name,
                                input_payload: inputPayload,
                                input_params: aiCase.input_params ?? aiCase.path_params ?? rs.crudStep.input_params,
                                expected_status: aiCase.expected_status ?? rs.crudStep.expected_status,
                                extract_vars: aiCase.extract_vars?.length ? aiCase.extract_vars : (rs.crudStep.extract_vars || []),
                            });
                        });

                        continue;
                    }

                    finalSteps.push({
                        ...rs.crudStep,
                        step_order: finalOrder++
                    });

                    continue;
                }

                // -----------------------------------------
                // SIGNUP
                // -----------------------------------------
                if (
                    rs.fixed &&
                    rs.name === 'Sign up' &&
                    signupId
                ) {
                    const ep = endpoints.find(
                        e => e.id === signupId
                    );

                    const schema = safeJSON(
                        ep?.request_body
                    );

                    const payload =
                        schema?._example ||
                        buildPayload(
                            Object.keys(schema?.properties || {}),
                            ep?.path
                        );

                    finalSteps.push({
                        step_order: finalOrder++,
                        name: 'Sign up',
                        endpoint_id: signupId,
                        method: 'POST',
                        input_payload: payload,
                        expected_status: 201,
                        extract_vars: [
                            { var: 'userId', path: 'id' }
                        ],
                        skip_if_failed: 0
                    });

                    continue;
                }

                // -----------------------------------------
                // LOGIN
                // -----------------------------------------
                if (
                    rs.fixed &&
                    rs.name === 'Login' &&
                    loginId
                ) {
                    const ep = endpoints.find(
                        e => e.id === loginId
                    );

                    const schema = safeJSON(
                        ep?.request_body
                    );

                    const payload =
                        schema?._example ||
                        buildPayload(
                            Object.keys(schema?.properties || {}),
                            ep?.path
                        );

                    finalSteps.push({
                        step_order: finalOrder++,
                        name: 'Login',
                        endpoint_id: loginId,
                        method: 'POST',
                        input_payload: payload,
                        expected_status: 200,
                        extract_vars: [
                            { var: 'token', path: finalTokenPath },
                            { var: 'token', path: 'data.token' },
                            { var: 'token', path: 'access_token' }
                        ],
                        skip_if_failed: 0
                    });

                    continue;
                }

                // -----------------------------------------
                // NORMAL ENDPOINT
                // -----------------------------------------
                const endpointId = rs.endpointId;

                const ep = endpoints.find(
                    e => e.id === endpointId
                );

                if (!ep) continue;

                // -----------------------------------------
                // ALL AI CASES
                // -----------------------------------------
                const aiCases = getAiCasesForEndpoint(
                    endpointId
                );

                if (aiCases.length > 0) {

                    aiCases.forEach((aiCase, caseIndex) => {

                        const caseKey =
                            getTestCaseKey(
                                endpointId,
                                caseIndex
                            );

                        const editedBody =
                            testCaseBodyOverrides[caseKey];

                        const generatedBody =
                            getAiCasePayload(aiCase);

                        const inputPayload =
                            editedBody !== undefined
                                ? editedBody
                                : generatedBody;

                        finalSteps.push({
                            step_order: finalOrder++,

                            name:
                                aiCase.name ||
                                `${ep.method} ${ep.path}`,

                            endpoint_id: ep.id,

                            method: ep.method,

                            path: ep.path,

                            input_payload: inputPayload,

                            input_params:
                                aiCase.input_params ??
                                aiCase.path_params ??
                                null,

                            expected_status:
                                aiCase.expected_status ??
                                (
                                    ep.method === 'DELETE'
                                        ? 204
                                        : ep.method === 'POST'
                                            ? 201
                                            : 200
                                ),

                            extract_vars:
                                aiCase.extract_vars || [],

                            skip_if_failed: 1
                        });

                    });

                    continue;
                }

                // -----------------------------------------
                // NORMAL NON-AI ENDPOINT
                // -----------------------------------------
                const schema = safeJSON(
                    ep.request_body
                );

                const hasBody =
                    ['POST', 'PUT', 'PATCH']
                        .includes(ep.method);

                const payload = hasBody
                    ? getRequestBodyForEndpoint(ep.id)
                    : null;

                const pathParams =
                    (ep.path.match(/\{(\w+)\}/g) || [])
                        .map(p => p.slice(1, -1));

                finalSteps.push({
                    step_order: finalOrder++,

                    name:
                        `${ep.method} ${ep.path}`,

                    endpoint_id: ep.id,

                    method: ep.method,

                    path: ep.path,

                    input_payload: payload,

                    input_params:
                        pathParams.length
                            ? Object.fromEntries(
                                pathParams.map(p => [
                                    p,
                                    `{{${p === 'id'
                                        ? 'userId'
                                        : p}}}`
                                ])
                            )
                            : null,

                    expected_status:
                        ep.method === 'DELETE'
                            ? 204
                            : ep.method === 'POST'
                                ? 201
                                : 200,

                    extract_vars: [],

                    skip_if_failed: 1
                });
            }

            const result = await api.flows.create(projectId, {
                name: suiteName || 'Full Auth Flow',
                description:
                    `Wizard: ${finalSteps.length} steps · ${groups.filter(
                        g => getGroupConfig(g.basePath).included
                    ).length
                    } CRUD groups`,
                steps: finalSteps,
                auth_type: authType,
                static_token:
                    authType === 'static'
                        ? staticToken
                        : null
            });
            onCreated(result);
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    }

    function buildPayload(fields, path) {
        const p = (path || '').toLowerCase();
        if (!fields.length) {
            if (p.includes('login') || p.includes('signin')) return { email: 'test@example.com', password: 'Test@123456' };
            if (p.includes('signup') || p.includes('register')) return { email: 'test@example.com', password: 'Test@123456', name: 'Test User' };
            return {};
        }
        const obj = {};
        fields.forEach(f => {
            const n = f.toLowerCase();
            if (n.includes('email')) obj[f] = 'test@example.com';
            else if (n.includes('password') || n === 'pass') obj[f] = 'Test@123456';
            else if (n.includes('name') && n.includes('user')) obj[f] = 'Test User';
            else if (n.includes('firstname') || n === 'first_name') obj[f] = 'Test';
            else if (n.includes('lastname') || n === 'last_name') obj[f] = 'User';
            else if (n.includes('username')) obj[f] = 'testuser';
            else if (n.includes('name')) obj[f] = 'Test Name';
            else if (n.includes('phone')) obj[f] = '+919876543210';
            else if (n.includes('title')) obj[f] = 'Test Title';
            else if (n.includes('desc')) obj[f] = 'Test description';
            else obj[f] = 'test_value';
        });
        return obj;
    }

    const TOKEN_OPTIONS = ['token', 'access_token', 'data.token', 'data.access_token', 'result.token', 'auth.token', 'jwt', 'custom'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Progress — compact */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    {Array.from({ length: TOTAL }, (_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, flexShrink: 0,
                                background: i + 1 < step ? 'var(--green)' : i + 1 === step ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                                color: i + 1 <= step ? '#fff' : 'var(--text-tertiary)',
                            }}>
                                {i + 1 < step ? <Check size={11} /> : i + 1}
                            </div>
                            {i < TOTAL - 1 && <div style={{ width: 14, height: 1, background: i + 1 < step ? 'var(--green)' : 'var(--border)' }} />}
                        </div>
                    ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {STEP_LABELS[step - 1]}
                </div>
            </div>

            {/* Scrollable step content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: 0 }}>

                {currentStepKey === 'auth_method' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Choose how HitAPI should authenticate when running this suite.
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            {/* Option 1 — Auto login flow */}
                            <div
                                onClick={() => setAuthType('flow')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'flow' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'flow' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'flow' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🔐 Auto login flow
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    HitAPI will run signup → login steps and extract the token automatically
                                </div>
                            </div>

                            {/* Option 2 — Static token */}
                            <div
                                onClick={() => setAuthType('static')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'static' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'static' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'static' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🔑 Static API token
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    Provide a fixed token — no login step needed. Good for API keys that never expire.
                                </div>
                            </div>

                            {/* Option 3 — No auth */}
                            <div
                                onClick={() => setAuthType('none')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'none' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'none' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'none' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🌐 No authentication
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    API is public — no Authorization header needed
                                </div>
                            </div>

                            {authType === 'static' && (
                                <div style={{ marginTop: 12 }}>
                                    <Label>API Token / Bearer token</Label>
                                    <input
                                        type="password"
                                        value={staticToken}
                                        onChange={e => setStaticToken(e.target.value)}
                                        placeholder="eyJhbGciOiJIUzI1NiJ9... or sk-..."
                                        style={{
                                            width: '100%', padding: '8px 10px', borderRadius: 6,
                                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                                            color: 'var(--text-primary)', fontSize: 12,
                                            fontFamily: 'JetBrains Mono, monospace',
                                        }}
                                    />
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                        This token will be sent as <code>Authorization: Bearer &lt;token&gt;</code> on every step
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {currentStepKey === 'signup' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Select the endpoint that creates a new user. This runs first, then login uses the same credentials.
                            <br />If your API doesn't have signup, click <strong>Skip</strong>.
                        </div>
                        <Label>Signup endpoint</Label>
                        <EndpointPicker endpoints={endpoints.filter(e => e.method === 'POST')}
                            value={signupId} onChange={setSignupId} placeholder="Skip — no signup needed" />
                        {signupEp && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 8, fontSize: 12, color: 'var(--green)', border: '1px solid var(--green-border)' }}>
                                ✓ Will POST to <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{signupEp.path}</code>
                            </div>
                        )}
                    </div>
                )}

                {currentStepKey === 'login' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Select the login endpoint. HitAPI will automatically try multiple credential combinations
                            (<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>email+password</code>,{' '}
                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>username+password</code>, etc.) until one works.
                        </div>
                        <Label>Login endpoint</Label>
                        <EndpointPicker endpoints={endpoints.filter(e => e.method === 'POST')}
                            value={loginId} onChange={setLoginId} placeholder="Skip — use static Bearer token" />
                        {loginEp && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 8, fontSize: 12, color: 'var(--green)', border: '1px solid var(--green-border)' }}>
                                ✓ Will POST to <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{loginEp.path}</code>
                            </div>
                        )}
                    </div>
                )}

                {currentStepKey === 'token' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Where is the token in the login response? HitAPI will try common paths automatically, but you can specify a custom one.
                        </div>
                        <Label>Token path in response</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}>
                            {TOKEN_OPTIONS.map(opt => (
                                <label key={opt} onClick={() => setTokenPath(opt)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: tokenPath === opt ? 'var(--accent-dim)' : 'var(--bg-input)',
                                    border: `1px solid ${tokenPath === opt ? 'rgba(130,100,255,0.4)' : 'var(--border)'}`,
                                }}>
                                    <div style={{
                                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                                        border: `2px solid ${tokenPath === opt ? 'var(--accent)' : 'var(--border)'}`,
                                        background: tokenPath === opt ? 'var(--accent)' : 'transparent'
                                    }} />
                                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: tokenPath === opt ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                        {opt === 'custom' ? 'Custom path…' : opt}
                                    </code>
                                    {opt === 'token' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>most common</span>}
                                    {opt === 'access_token' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>OAuth2</span>}
                                </label>
                            ))}
                        </div>
                        {tokenPath === 'custom' && (
                            <div style={{ marginTop: 10 }}>
                                <Label hint="e.g. result.auth.jwt">Custom path</Label>
                                <Input value={customToken} onChange={setCustomToken} placeholder="data.access_token" />
                            </div>
                        )}
                        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            💡 HitAPI will also try 15 common token paths automatically as fallback.
                        </div>
                    </div>
                )}

                {currentStepKey === 'endpoints' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                            Select which endpoints to include in the suite. These will run after login with the token automatically injected.
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <button onClick={() => setSelected(new Set(otherEps.map(e => e.id)))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.3)' }}>
                                Select all ({otherEps.length})
                            </button>
                            <button onClick={() => {
                                const secured = otherEps.filter(e => { try { const s = JSON.parse(e.security || '[]'); return s.length > 0; } catch { return false; } });
                                setSelected(new Set(secured.map(e => e.id)));
                            }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                <Lock size={10} style={{ marginRight: 4 }} />Secured only
                            </button>
                            <button onClick={() => setSelected(new Set())}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                Clear
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflow: 'auto' }}>
                            {otherEps.map(ep => {
                                const checked = selected.has(ep.id);
                                const isSecured = (() => { try { const s = JSON.parse(ep.security || '[]'); return s.length > 0; } catch { return false; } })();
                                return (
                                    <div key={ep.id} onClick={() => toggleEndpoint(ep.id)} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        borderRadius: 6, cursor: 'pointer',
                                        background: checked ? 'rgba(130,100,255,0.06)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${checked ? 'rgba(130,100,255,0.2)' : 'var(--border)'}`,
                                    }}>
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                            border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                                            background: checked ? 'var(--accent)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {checked && <Check size={9} color="#fff" />}
                                        </div>
                                        <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
                                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-secondary)' }}>{ep.path}</span>
                                        {isSecured && <Lock size={10} color="var(--accent)" style={{ flexShrink: 0 }} />}
                                        {ep.summary && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{ep.summary.slice(0, 25)}</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-tertiary)' }}>
                                {selected.size} endpoint{selected.size !== 1 ? 's' : ''} selected
                            </span>
                            {(() => {
                                const total = (signupId ? 1 : 0) + (loginId ? 1 : 0) + selected.size;
                                const over = total > 100;
                                return (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: over ? 'var(--red)' : total > 90 ? 'var(--amber)' : 'var(--green)' }}>
                                        {total}/100 steps {over ? '⚠ over limit' : ''}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {currentStepKey === 'auth_config' && (
                    <StepAuthConfig
                        annotated={annotated}
                        toggleAuth={toggleAuth}
                        authCount={authCount}
                        publicCount={publicCount}
                    />
                )}

                {currentStepKey === 'crud' && (
                    <StepCrudGroups
                        groups={groups}
                        getGroupConfig={getGroupConfig}
                        toggleGroup={toggleGroup}
                        setIdPath={setIdPath}
                        excludeEndpoint={excludeEndpoint}
                        moveEndpoint={moveEndpoint}
                        resetEndpoint={resetEndpoint}
                        endpointOverrides={endpointOverrides}
                        excludedEndpoints={excludedEndpoints}
                    />
                )}

                {currentStepKey === 'review' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Suite name — its own card, feels like a proper "title" field */}
                        <div style={{
                            padding: '14px 16px',
                            borderRadius: 10,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                        }}>
                            <Label>Suite name</Label>
                            <Input value={suiteName} onChange={setSuiteName} placeholder="My Auth Flow" />
                        </div>

                        {/* AI generation status — pinned banner, not inline noise */}
                        {generatingAI && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 10,
                                background: 'linear-gradient(90deg, rgba(130,100,255,0.12), rgba(130,100,255,0.04))',
                                border: '1px solid rgba(130,100,255,0.25)',
                            }}>
                                <div className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                                        Generating request bodies with AI
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                                        {aiProgress.done} of {aiProgress.total} endpoints done
                                    </div>
                                </div>
                                {/* mini progress bar */}
                                <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${aiProgress.total ? (aiProgress.done / aiProgress.total) * 100 : 0}%`,
                                        background: 'var(--accent)',
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Section header — quieter, sits above the list like a table header */}
                        <div style={{
                            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                            padding: '0 2px',
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                Steps <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>({reviewSteps.length})</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ChevronLeft size={11} style={{ transform: 'rotate(90deg)' }} />
                                reorder · <Lock size={10} /> fixed steps can't move
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
                            {reviewSteps.map((s, i) => {
                                const endpointId = s.crudStep?.endpoint_id || s.endpointId;
                                const ep = endpointId ? endpoints.find(e => e.id === endpointId) : null;
                                const isExpanded = expandedReviewSteps.has(i);
                                const method = s.crudStep?.method || s.method || ep?.method;
                                const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
                                const aiCases = endpointId ? getAiCasesForEndpoint(endpointId) : [];
                                const bodyText = endpointId ? getRequestBodyText(s) : '';
                                const bodyError = endpointId ? requestBodyErrors[endpointId] : '';
                                const isEdited = endpointId && requestBodyOverrides[endpointId] !== undefined;
                                const isSaved = endpointId && savedRequestBodies.has(endpointId);
                                const firstMovable = signupId && loginId ? 2 : (signupId || loginId) ? 1 : 0;

                                return (
                                    <div
                                        key={`${endpointId || 'step'}-${i}`}
                                        ref={el => { reviewCardRefs.current[i] = el; }}
                                        style={{
                                            borderRadius: 10,
                                            background: isExpanded ? 'rgba(130,100,255,0.05)' : 'var(--bg-card)',
                                            border: `1px solid ${isExpanded ? 'rgba(130,100,255,0.35)' : 'var(--border)'}`,
                                            boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.25)' : 'none',
                                            overflow: 'hidden',
                                            transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        }}
                                    >
                                        {/* ================= HEADER ================= */}
                                        <div
                                            onClick={() => {
                                                const willExpand = !expandedReviewSteps.has(i);
                                                toggleReviewStep(i);
                                                if (willExpand) {
                                                    requestAnimationFrame(() => {
                                                        reviewCardRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                                                    });
                                                }
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '11px 12px', cursor: 'pointer',
                                            }}
                                        >
                                            <ChevronRight
                                                size={14}
                                                style={{
                                                    color: 'var(--text-tertiary)', flexShrink: 0,
                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.15s',
                                                }}
                                            />

                                            <div style={{
                                                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                                background: `${s.color}1a`, border: `1px solid ${s.color}33`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, fontWeight: 700, color: s.color,
                                            }}>
                                                {s.order}
                                            </div>

                                            <span className={`method-badge method-${method}`} style={{ fontSize: 9, flexShrink: 0, minWidth: 44, textAlign: 'center' }}>
                                                {method}
                                            </span>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 500,
                                                    color: 'var(--text-primary)', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {s.name && !s.name.startsWith(method) ? s.name + ' · ' : ''}{s.path}
                                                </div>
                                                {ep?.summary && (
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {ep.summary}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Status badges — small pills only. The full AI case cards render
                                                below in the EXPANDED section, never here. */}
                                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                {aiCases.length > 0 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '3px 7px', borderRadius: 20,
                                                        background: 'rgba(130,100,255,0.14)', color: 'var(--accent)',
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                    }}>
                                                        ✨ {aiCases.length > 1 ? `${aiCases.length} cases` : 'AI'}
                                                    </span>
                                                )}
                                                {isEdited && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '3px 7px', borderRadius: 20,
                                                        background: 'rgba(50,200,120,0.14)', color: 'var(--green)',
                                                    }}>
                                                        Edited
                                                    </span>
                                                )}
                                                {s.fixed && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '3px 7px', borderRadius: 20,
                                                        background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)',
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                    }}>
                                                        <Lock size={8} /> fixed
                                                    </span>
                                                )}
                                            </div>

                                            {/* Reorder — visually separated with a divider */}
                                            {!s.fixed && (
                                                <div
                                                    onClick={e => e.stopPropagation()}
                                                    style={{
                                                        display: 'flex', gap: 2, flexShrink: 0,
                                                        paddingLeft: 8, marginLeft: 2,
                                                        borderLeft: '1px solid var(--border)',
                                                    }}
                                                >
                                                    <button
                                                        onClick={() => moveReviewStep(i, -1)}
                                                        disabled={i <= firstMovable}
                                                        style={{
                                                            width: 22, height: 22, borderRadius: 5, cursor: i <= firstMovable ? 'default' : 'pointer',
                                                            background: 'transparent', border: 'none',
                                                            color: i <= firstMovable ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                                                            fontSize: 12, opacity: i <= firstMovable ? 0.35 : 1,
                                                        }}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        onClick={() => moveReviewStep(i, 1)}
                                                        disabled={i === reviewSteps.length - 1}
                                                        style={{
                                                            width: 22, height: 22, borderRadius: 5,
                                                            cursor: i === reviewSteps.length - 1 ? 'default' : 'pointer',
                                                            background: 'transparent', border: 'none',
                                                            color: i === reviewSteps.length - 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                                                            fontSize: 12, opacity: i === reviewSteps.length - 1 ? 0.35 : 1,
                                                        }}
                                                    >
                                                        ↓
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* ================= EXPANDED DETAILS ================= */}
                                        {isExpanded && (
                                            <div style={{
                                                padding: '4px 14px 16px 46px', // indented to align under the path text
                                                borderTop: '1px solid var(--border)',
                                                display: 'flex', flexDirection: 'column', gap: 14,
                                            }}>

                                                {/* Endpoint schema — collapsed as reference material, not a form */}
                                                {ep?.request_body && (
                                                    <details style={{ fontSize: 11 }}>
                                                        <summary style={{
                                                            cursor: 'pointer', fontSize: 10, fontWeight: 600,
                                                            color: 'var(--text-tertiary)', marginTop: 10, userSelect: 'none',
                                                        }}>
                                                            OpenAPI request schema
                                                        </summary>
                                                        <pre style={{
                                                            margin: '8px 0 0 0', padding: 10,
                                                            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                                                            borderRadius: 6, fontSize: 10, lineHeight: 1.5,
                                                            overflow: 'auto', maxHeight: 160, color: 'var(--text-tertiary)',
                                                        }}>
                                                            {JSON.stringify(safeJSON(ep.request_body), null, 2)}
                                                        </pre>
                                                    </details>
                                                )}

                                                {/* AI CASES — the ONLY place these render. Each case is its own
                                                    sub-card with a colored status rail and an auto-growing textarea. */}
                                                {aiCases.length > 0 && (
                                                    <div>
                                                        <div style={{
                                                            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                                                            color: 'var(--text-tertiary)', marginBottom: 8,
                                                        }}>
                                                            AI-generated cases · {aiCases.length}
                                                        </div>

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {aiCases.map((aiCase, caseIndex) => {
                                                                const caseKey = getTestCaseKey(endpointId, caseIndex);
                                                                const body = getTestCaseBody(endpointId, caseIndex, aiCase);
                                                                const caseBodyText = testCaseBodyText[caseKey] !== undefined
                                                                    ? testCaseBodyText[caseKey]
                                                                    : (body == null ? '{}' : JSON.stringify(body, null, 2));
                                                                const caseBodyError = testCaseBodyErrors[caseKey];
                                                                const isErrorCase = aiCase.expected_status >= 400;

                                                                return (
                                                                    <div key={caseKey} style={{
                                                                        position: 'relative',
                                                                        paddingLeft: 12,
                                                                        borderRadius: 8,
                                                                        background: 'var(--bg-input)',
                                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                                                    }}>
                                                                        {/* colored rail instead of a boxed border */}
                                                                        <div style={{
                                                                            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                                                                            borderRadius: '8px 0 0 8px',
                                                                            background: isErrorCase ? 'var(--red)' : 'var(--green)',
                                                                        }} />

                                                                        <div style={{ padding: '9px 12px 9px 4px' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                                                                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                                    {caseIndex + 1}. {aiCase.name}
                                                                                </div>
                                                                                <span style={{
                                                                                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, flexShrink: 0,
                                                                                    background: isErrorCase ? 'rgba(230,90,90,0.12)' : 'rgba(50,200,120,0.12)',
                                                                                    color: isErrorCase ? 'var(--red)' : 'var(--green)',
                                                                                }}>
                                                                                    {aiCase.expected_status}
                                                                                </span>
                                                                            </div>

                                                                            {aiCase.reasoning && (
                                                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.45, marginTop: 3 }}>
                                                                                    {aiCase.reasoning}
                                                                                </div>
                                                                            )}

                                                                            {['POST', 'PUT', 'PATCH'].includes(method) && (
                                                                                <div style={{ marginTop: 8 }}>
                                                                                    <AutoTextarea
                                                                                        value={caseBodyText}
                                                                                        onFocus={() => startEditingTestCaseBody(endpointId, caseIndex, aiCase)}
                                                                                        onChange={e => updateTestCaseBodyText(endpointId, caseIndex, e.target.value)}
                                                                                        error={caseBodyError}
                                                                                    />
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                                                                                        <span style={{ fontSize: 9.5, color: caseBodyError ? 'var(--red)' : 'transparent' }}>
                                                                                            {caseBodyError ? `⚠ ${caseBodyError}` : '·'}
                                                                                        </span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => saveTestCaseBody(endpointId, caseIndex)}
                                                                                            style={{
                                                                                                padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                                                                                border: 'none', background: 'rgba(130,100,255,0.14)',
                                                                                                color: 'var(--accent)', cursor: 'pointer',
                                                                                            }}
                                                                                        >
                                                                                            Save
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* REQUEST BODY (single, non-AI endpoints only) */}
                                                {hasBody && endpointId && aiCases.length === 0 && (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                                Request body
                                                            </div>
                                                            {isSaved && (
                                                                <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>✓ Saved</span>
                                                            )}
                                                        </div>

                                                        <AutoTextarea
                                                            value={bodyText}
                                                            onFocus={() => startEditingRequestBody(s)}
                                                            onChange={e => updateRequestBodyText(endpointId, e.target.value)}
                                                            error={bodyError}
                                                            minHeight={80}
                                                            maxHeight={320}
                                                        />
                                                        {bodyError && (
                                                            <div style={{ marginTop: 5, fontSize: 10, color: 'var(--red)' }}>⚠ {bodyError}</div>
                                                        )}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                                                            <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)' }}>
                                                                Edit this JSON before creating the suite.
                                                            </span>
                                                            <button
                                                                onClick={() => saveRequestBody(endpointId)}
                                                                style={{
                                                                    padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                                                    border: '1px solid var(--accent)', background: 'var(--accent-dim)',
                                                                    color: 'var(--accent)', cursor: 'pointer',
                                                                }}
                                                            >
                                                                ✓ Save request body
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* PATH PARAMS — inline chips */}
                                                {ep?.path && /\{[^}]+\}/.test(ep.path) && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)' }}>Path params:</span>
                                                        {(ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1)).map(param => (
                                                            <code key={param} style={{
                                                                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                                                                padding: '2px 7px', borderRadius: 5,
                                                                background: 'rgba(130,100,255,0.08)', color: 'var(--accent)',
                                                            }}>
                                                                {param} → {`{{${param === 'id' ? 'userId' : param}}}`}
                                                            </code>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {authType === 'flow' && !signupEp && !loginEp && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 10, fontSize: 12, color: 'var(--red)',
                            }}>
                                ⚠ Select at least a login or signup endpoint to continue
                            </div>
                        )}
                        {error && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 10, fontSize: 12, color: 'var(--red)',
                            }}>
                                ⚠ {error}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer navigation — always visible */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-card)' }}>
                <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                    <ChevronLeft size={14} /> {step > 1 ? 'Back' : 'Cancel'}
                </button>
                {step < TOTAL ? (
                    <button onClick={() => setStep(s => s + 1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500 }}>
                        Next <ChevronRight size={14} />
                    </button>
                ) : (
                    <button onClick={handleCreate} disabled={creating || (authType === 'flow' && !signupId && !loginId) || (authType === 'static' && !staticToken.trim())}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: creating ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: creating ? 0.7 : 1 }}>
                        {creating ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Creating…</> : <><Check size={14} /> Create suite</>}
                    </button>
                )}
            </div>
        </div>
    );
}