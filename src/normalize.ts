export const VENDOR_PACKAGE_VERSION = '3.1.1';

interface VendorResult {
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  structuredContent?: unknown;
  [key: string]: unknown;
}

function textContent(result: VendorResult): string {
  return (result.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function parseJson(text: string): Record<string, any> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  try {
    const value = JSON.parse(text.slice(start));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function isPendingCode(code: number): boolean {
  return code === 20100 || code === 40601 || code === 40602;
}

function isNoResultCode(code: number): boolean {
  return code === 40102;
}

function isSuccessCode(code: number): boolean {
  return code === 20000;
}

function statusFailure(code: number) {
  if (code === 40100) return { code: 'authentication_failed', retryable: false, nextAction: 'Correct the DataForSEO API login/password before retrying.' };
  if (code === 40103) return { code: 'task_execution_failed', retryable: true, nextAction: 'Review task parameters and resubmit once if the result is still required.' };
  if (code === 40104) return { code: 'account_verification_required', retryable: false, nextAction: 'Complete DataForSEO account verification before retrying.' };
  if (code === 40200 || code === 40210) return { code: 'billing_or_balance_blocked', retryable: false, nextAction: 'Restore account balance/billing before retrying.' };
  if (code === 40201) return { code: 'account_paused', retryable: false, nextAction: 'Contact DataForSEO support to resolve the account pause.' };
  if (code === 40202 || code === 40209) return { code: 'rate_limited', retryable: true, nextAction: 'Wait for rate/concurrency capacity, then retry once.' };
  if (code === 40203) return { code: 'cost_limit_exceeded', retryable: false, nextAction: 'Reduce scope or obtain authority to change the DataForSEO cost limit.' };
  if (code === 40204) return { code: 'subscription_required', retryable: false, nextAction: 'Activate the required DataForSEO plan before retrying.' };
  if (code === 40205 || code === 40206) return { code: 'duplicate_task_limit', retryable: false, nextAction: 'Reuse the existing result or wait for the duplicate-task window to reset.' };
  if (code === 40207) return { code: 'ip_not_whitelisted', retryable: false, nextAction: 'Add the approved server IP to the DataForSEO account whitelist.' };
  if (code >= 40400 && code < 40500) return { code: 'not_found_or_expired', retryable: false, nextAction: 'Correct the path/task ID/target or recreate an expired task intentionally.' };
  if (code >= 40500 && code < 40600) return { code: 'invalid_request', retryable: false, nextAction: 'Use docs_search and correct the endpoint fields/body before retrying.' };
  if (code >= 50000) return { code: 'upstream_failure', retryable: true, nextAction: 'Wait for DataForSEO or its upstream provider to recover, then retry once.' };
  return { code: `dataforseo_${code}`, retryable: false, nextAction: 'Inspect the vendor status message and correct its stated precondition before retrying.' };
}

function target(args: Record<string, unknown>) {
  return {
    type: 'dataforseo_api',
    identifiers: {
      method: args.method ?? null,
      path: args.path ?? null,
      url: args.url ?? null,
    },
  };
}

function contentResult(envelope: Record<string, unknown>, isError = false): VendorResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function normalizeVendorResult(
  toolName: string,
  args: Record<string, unknown>,
  vendorResult: VendorResult,
): VendorResult {
  const text = textContent(vendorResult);
  if (toolName !== 'api_request') {
    const summary = `${toolName} returned DataForSEO documentation.`;
    const envelope: Record<string, unknown> = {
      status: vendorResult.isError ? 'failed' : 'succeeded',
      operation: toolName,
      summary,
      target: { type: 'dataforseo_documentation', identifiers: {} },
      result: { data: { text }, vendorStructuredContent: vendorResult.structuredContent ?? null, _meta: { packageVersion: VENDOR_PACKAGE_VERSION } },
      proof: { vendorMcpSucceeded: vendorResult.isError !== true },
      warnings: [],
      recovery: vendorResult.isError ? { nextAction: 'Correct the documentation section/URL and retry once.' } : null,
    };
    if (vendorResult.isError) {
      envelope.error = {
        code: 'documentation_request_failed',
        retryable: false,
        ambiguous: false,
        nextAction: 'Correct the documentation section/URL and retry once.',
      };
    }
    return contentResult(envelope, vendorResult.isError === true);
  }

  const payload = parseJson(text);
  if (!payload) {
    const summary = vendorResult.isError
      ? 'DataForSEO MCP returned an unstructured error.'
      : 'DataForSEO MCP returned non-JSON API content.';
    return contentResult({
      status: 'failed',
      operation: toolName,
      summary,
      target: target(args),
      error: { code: 'invalid_vendor_response', retryable: false, ambiguous: false, nextAction: 'Preserve the vendor text and stop; do not treat it as API success.' },
      result: { data: { text }, _meta: { packageVersion: VENDOR_PACKAGE_VERSION } },
    }, true);
  }

  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const generalCode = typeof payload.status_code === 'number' ? payload.status_code : null;
  const taskCodes = tasks.map((task: any) => Number(task?.status_code)).filter(Number.isFinite);
  const codes = [...(generalCode === null ? [] : [generalCode]), ...taskCodes];
  const pendingTasks = tasks.filter((task: any) => isPendingCode(Number(task?.status_code)));
  const noResultTasks = tasks.filter((task: any) => isNoResultCode(Number(task?.status_code)));
  const successTasks = tasks.filter((task: any) => isSuccessCode(Number(task?.status_code)));
  const failedTasks = tasks.filter((task: any) => {
    const code = Number(task?.status_code);
    return Number.isFinite(code) && !isSuccessCode(code) && !isPendingCode(code) && !isNoResultCode(code);
  });
  const generalFailed = generalCode !== null && !isSuccessCode(generalCode) && !isPendingCode(generalCode) && !isNoResultCode(generalCode);
  const optimized = Object.prototype.hasOwnProperty.call(payload, 'items') && !Object.prototype.hasOwnProperty.call(payload, 'tasks');
  const items = Array.isArray(payload.items) ? payload.items : [];
  const taskIds = tasks.map((task: any) => task?.id).filter((id: unknown) => typeof id === 'string');
  const costValues = [payload.cost, ...tasks.map((task: any) => task?.cost)].filter((value) => typeof value === 'number') as number[];
  const costKnown = costValues.length > 0;
  const costUsd = typeof payload.cost === 'number' ? payload.cost : costValues.reduce((sum, value) => sum + value, 0);
  const resultCount = optimized
    ? items.length
    : tasks.reduce((sum: number, task: any) => sum + (typeof task?.result_count === 'number' ? task.result_count : Array.isArray(task?.result) ? task.result.length : 0), 0);
  const hasSuccess = successTasks.length > 0 || (generalCode === 20000 && tasks.length === 0 && !vendorResult.isError);
  const hasFailure = generalFailed || failedTasks.length > 0 || vendorResult.isError === true;
  let status: 'succeeded' | 'no_op' | 'pending' | 'partial' | 'failed';
  if (hasFailure && (hasSuccess || pendingTasks.length > 0 || noResultTasks.length > 0)) status = 'partial';
  else if (hasFailure) status = 'failed';
  else if (pendingTasks.length > 0 || (generalCode !== null && isPendingCode(generalCode))) status = 'pending';
  else if (noResultTasks.length > 0 || (generalCode !== null && isNoResultCode(generalCode)) || resultCount === 0) status = 'no_op';
  else status = 'succeeded';

  const failureCode = failedTasks[0]?.status_code ?? (generalFailed ? generalCode : null);
  const classified = failureCode === null ? null : statusFailure(Number(failureCode));
  const warnings: string[] = [];
  if (optimized) warnings.push('The AI-optimized response may omit cost and full task metadata; use noAiMode:true when exact cost/status proof is required.');
  if (!costKnown && toolName === 'api_request') warnings.push('Actual DataForSEO cost is unknown because the vendor response omitted cost.');
  if (status === 'partial') warnings.push(`${failedTasks.length + (generalFailed ? 1 : 0)} vendor status failure(s) occurred alongside usable or pending results.`);
  const summary = status === 'succeeded'
    ? `DataForSEO API request succeeded with ${resultCount} result item(s).`
    : status === 'no_op'
      ? 'DataForSEO completed the request but returned no result items.'
      : status === 'pending'
        ? `DataForSEO accepted ${pendingTasks.length || tasks.length} task(s); results are pending.`
        : status === 'partial'
          ? 'DataForSEO returned a partial result; inspect per-task status codes.'
          : `DataForSEO request failed${failureCode === null ? '' : ` with status ${failureCode}`}.`;
  const envelope: Record<string, unknown> = {
    status,
    operation: toolName,
    summary,
    target: target(args),
    result: { data: payload, vendorStructuredContent: vendorResult.structuredContent ?? null, _meta: { packageVersion: VENDOR_PACKAGE_VERSION, optimized } },
    proof: {
      generalStatusCode: generalCode,
      taskStatusCodes: taskCodes,
      taskIds,
      tasksError: payload.tasks_error ?? failedTasks.length,
      resultCount,
      costUsd: costKnown ? costUsd : null,
      costKnown,
    },
    warnings,
    recovery: status === 'pending'
      ? { nextAction: 'Preserve the task IDs, use docs_search to find the matching task_get endpoint, and reconcile before claiming completion.' }
      : status === 'partial'
        ? { nextAction: 'Use successful task results only; correct or reconcile each failed/pending task by its status code and ID.' }
        : null,
  };
  if (status === 'failed') {
    envelope.error = {
      code: classified?.code ?? 'vendor_mcp_error',
      retryable: classified?.retryable ?? false,
      ambiguous: false,
      vendorStatusCode: failureCode,
      nextAction: classified?.nextAction ?? 'Inspect the vendor response and correct its stated precondition before retrying.',
    };
  }
  return contentResult(envelope, status === 'failed');
}

export function childFailureResult(
  toolName: string,
  args: Record<string, unknown>,
  message: string,
): VendorResult {
  const summary = `DataForSEO MCP child failed: ${message.slice(0, 1_000)}`;
  return contentResult({
    status: 'failed',
    operation: toolName,
    summary,
    target: target(args),
    error: {
      code: toolName === 'api_request' ? 'ambiguous_paid_request' : 'vendor_mcp_unavailable',
      retryable: false,
      ambiguous: toolName === 'api_request',
      nextAction: toolName === 'api_request'
        ? 'Request execution and cost are unknown; inspect account/task state before deciding whether to repeat it.'
        : 'Restore the pinned DataForSEO MCP child and retry once.',
    },
  }, true);
}
