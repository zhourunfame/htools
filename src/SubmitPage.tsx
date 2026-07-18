import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Github,
  LogOut
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Locale, Messages } from "./i18n";
import { proxifyUrl } from "./proxy";
import {
  SubmissionApiError,
  loadGitHubAuthState,
  loadSubmissionTurnstileConfig,
  logoutGitHub,
  submitTool,
  type SubmissionTurnstileConfig
} from "./submit-api";
import TurnstileWidget from "./components/TurnstileWidget";
import type {
  GitHubAuthState,
  ProxySettings,
  SubmissionInput
} from "./types";

type StatusTone = "success" | "error" | "info";
type StatusScope = "auth" | "submit";
const SUBMISSION_DRAFT_KEY = "htools-submission-draft-v1";

type SubmissionDraft = Pick<SubmissionInput, "name" | "description" | "url" | "category"> & {
  tagText: string;
};

type SubmitPageProps = {
  categories: Array<{ label: string; value: string }>;
  locale: Locale;
  normalizeUrl: (value: string) => string;
  parseTags: (value: string) => string[];
  proxySettings: ProxySettings;
  resolveError: (error: unknown) => string;
  siteSettingsLoaded: boolean;
  t: Messages;
};

export default function SubmitPage({
  categories,
  locale,
  normalizeUrl,
  parseTags,
  proxySettings,
  resolveError,
  t
}: SubmitPageProps) {
  const [authState, setAuthState] = useState<GitHubAuthState>({
    configured: false,
    authenticated: false,
    user: null
  });
  const [form, setForm] = useState<SubmissionInput>({
    name: "",
    description: "",
    url: "",
    category: categories[0]?.value ?? "Other Tools",
    tags: []
  });
  const [tagText, setTagText] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [statusScope, setStatusScope] = useState<StatusScope>("auth");
  const [issueUrl, setIssueUrl] = useState("");
  const [resultKind, setResultKind] = useState<"created" | "pending" | "existing" | null>(null);
  const [submittedName, setSubmittedName] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authStateError, setAuthStateError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileConfig, setTurnstileConfig] = useState<SubmissionTurnstileConfig | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const submittingRef = useRef(false);
  const authRefreshRequestRef = useRef(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const name = form.name.trim();
    const description = form.description.trim();
    const url = form.url.trim();

    if (!name) errors.name = t.submitPage.validationNameRequired;
    else if (name.length > 100) errors.name = t.submitPage.validationNameTooLong;
    if (!url) errors.url = t.submitPage.validationUrlRequired;
    else {
      try {
        const parsed = new URL(normalizeUrl(url));
        if (!/^https?:$/.test(parsed.protocol)) throw new Error();
      } catch {
        errors.url = t.submitPage.validationUrlInvalid;
      }
    }
    if (!description) errors.description = t.submitPage.validationDescriptionRequired;
    else if (description.length > 1000) {
      errors.description = t.submitPage.validationDescriptionTooLong;
    }
    if (!form.category) errors.category = t.submitPage.validationCategoryRequired;
    return errors;
  }, [form, normalizeUrl, t.submitPage]);
  const isFormValid = Object.keys(validation).length === 0;

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(
      () => setCooldownSeconds((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldownSeconds > 0]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SUBMISSION_DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<SubmissionDraft>;
        const category = categories.some((item) => item.value === draft.category)
          ? draft.category!
          : categories[0]?.value ?? "Other Tools";
        setForm((current) => ({
          ...current,
          name: typeof draft.name === "string" ? draft.name : "",
          description: typeof draft.description === "string" ? draft.description : "",
          url: typeof draft.url === "string" ? draft.url : "",
          category
        }));
        setTagText(typeof draft.tagText === "string" ? draft.tagText : "");
      }
    } catch {
      window.localStorage.removeItem(SUBMISSION_DRAFT_KEY);
    } finally {
      setDraftLoaded(true);
    }
  }, [categories]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft: SubmissionDraft = {
      name: form.name,
      description: form.description,
      url: form.url,
      category: form.category,
      tagText
    };
    window.localStorage.setItem(SUBMISSION_DRAFT_KEY, JSON.stringify(draft));
  }, [draftLoaded, form.category, form.description, form.name, form.url, tagText]);

  async function refreshAuthState() {
    const requestId = authRefreshRequestRef.current + 1;
    authRefreshRequestRef.current = requestId;
    setIsAuthLoading(true);
    setAuthStateError(false);
    const authRequest = loadGitHubAuthState()
      .then((state) => {
        if (authRefreshRequestRef.current === requestId) {
          setAuthState(state);
          setAuthStateError(false);
        }
      })
      .catch(() => {
        if (authRefreshRequestRef.current === requestId) {
          setAuthStateError(true);
        }
      })
      .finally(() => {
        if (authRefreshRequestRef.current === requestId) setIsAuthLoading(false);
      });
    const turnstileRequest = loadSubmissionTurnstileConfig()
      .catch(() => loadSubmissionTurnstileConfig())
      .then((config) => {
        if (authRefreshRequestRef.current !== requestId) return;
        setTurnstileConfig(config);
        if (!config.turnstileEnabled) {
          setTurnstileToken("");
        }
      })
      .catch(() => {
        if (authRefreshRequestRef.current !== requestId) return;
        setTurnstileConfig({ turnstileEnabled: false, turnstileSiteKey: "" });
        setTurnstileToken("");
      });

    await Promise.all([authRequest, turnstileRequest]);
  }

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleTurnstileLoadError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleTurnstileTokenChange = useCallback((nextToken: string) => {
    setTurnstileToken(nextToken);
  }, []);

  useEffect(() => {
    void refreshAuthState();
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");

    if (authResult === "failed") {
      setStatus(t.status.loginFailed);
      setStatusTone("error");
      setStatusScope("auth");
      setIssueUrl("");
    }

    if (authResult) {
      params.delete("auth");
      const queryString = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
      );
    }
  }, [t.status.loginFailed]);

  function handleGitHubLogin() {
    const draft: SubmissionDraft = { ...form, tagText };
    window.localStorage.setItem(SUBMISSION_DRAFT_KEY, JSON.stringify(draft));
    window.location.href = `/api/github/login?returnTo=${encodeURIComponent("/submit")}`;
  }

  async function handleGitHubLogout() {
    try {
      await logoutGitHub();
      setAuthState((current) => ({
        ...current,
        authenticated: false,
        user: null
      }));
      await refreshAuthState();
      setIssueUrl("");
      setStatus(t.status.githubLogoutSuccess);
      setStatusTone("success");
      setStatusScope("auth");
    } catch {
      setIssueUrl("");
      setStatus(t.status.githubLogoutFailed);
      setStatusTone("error");
      setStatusScope("auth");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setIssueUrl("");
    setResultKind(null);
    setStatusScope("submit");

    if (authStateError) {
      setStatus(t.submitPage.authStateUnavailableDescription);
      setStatusTone("error");
      return;
    }
    if (!authState.configured) {
      setStatus(t.submitPage.githubNotConfigured);
      setStatusTone("error");
      return;
    }
    if (!authState.authenticated) {
      setStatus(t.submitPage.signInRequired);
      setStatusTone("error");
      return;
    }
    setTouched({ name: true, url: true, description: true, category: true });
    if (!isFormValid) {
      setStatus(t.submitPage.validationFixForm);
      setStatusTone("error");
      return;
    }
    if (turnstileConfig?.turnstileEnabled && !turnstileToken) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setStatus("");
    let shouldResetTurnstile = Boolean(turnstileConfig?.turnstileEnabled);
    try {
      const result = await submitTool({
        ...form,
        locale,
        url: normalizeUrl(form.url),
        tags: parseTags(tagText).slice(0, 8)
      }, turnstileToken);
      setIssueUrl(result.issueUrl);
      setResultKind(result.kind);
      setSubmittedName(form.name.trim());
      setStatus(
        result.kind === "pending"
          ? t.submitPage.pendingSuccess(result.issueNumber)
          : t.submitPage.success(result.issueNumber)
      );
      setStatusTone("success");
      setForm({
        name: "",
        description: "",
        url: "",
        category: categories[0]?.value ?? "Other Tools",
        tags: []
      });
      setTagText("");
      setTouched({});
      window.localStorage.removeItem(SUBMISSION_DRAFT_KEY);
    } catch (error) {
      if (error instanceof SubmissionApiError) {
        if (
          error.code === "GITHUB_NOT_CONFIGURED" ||
          error.code === "GITHUB_AUTH_REQUIRED"
        ) {
          shouldResetTurnstile = false;
        }
        if (error.status === 401) await refreshAuthState();
        if (error.status === 429 && error.retryAfter > 0) {
          setCooldownSeconds(error.retryAfter);
        }
        if (error.existingTool) {
          setIssueUrl(error.existingTool.url);
          setResultKind("existing");
          setSubmittedName(error.existingTool.name);
          setStatus(t.submitPage.existingTool(error.existingTool.name));
          setStatusTone("success");
        } else {
          setIssueUrl("");
          setResultKind(null);
          const isTurnstileError = [
            "TURNSTILE_CONFIG_ERROR",
            "TURNSTILE_FAILED",
            "TURNSTILE_REQUIRED",
            "TURNSTILE_UNAVAILABLE"
          ].includes(error.code ?? "");
          if (isTurnstileError) {
            setStatus("");
          } else {
            setStatus(
              error.status === 401
                ? t.submitPage.sessionExpired
                : error.status === 429
                  ? t.submitPage.rateLimited
                  : error.status >= 500
                    ? t.submitPage.githubCheckFailed
                    : t.submitPage.submissionFailed
            );
          }
        }
      } else {
        setIssueUrl("");
        setResultKind(null);
        setStatus(resolveError(error));
      }
      if (!(error instanceof SubmissionApiError && error.existingTool)) {
        setStatusTone("error");
      }
    } finally {
      if (shouldResetTurnstile) {
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
      }
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="category-page public-page public-submit-page">
      <section className="category-page-hero">
        <div>
          <h1>{t.submitPage.heading}</h1>
          <p>{t.submitPage.description}</p>
        </div>
        <div className="submit-page-auth-action" aria-busy={isAuthLoading}>
          {isAuthLoading ? null : authStateError ? (
            <button
              className="ghost-button submit-button"
              type="button"
              onClick={() => void refreshAuthState()}
            >
              {t.submitPage.retryAuthState}
            </button>
          ) : authState.authenticated ? (
            <button
              className="primary-button submit-button glow-button"
              title={authState.user ? t.submitPage.signedInAs(authState.user.login) : undefined}
              type="button"
              onClick={() => void handleGitHubLogout()}
            >
              <LogOut size={16} />
              {t.actions.logoutGitHub}
            </button>
          ) : (
            <button
              className="primary-button submit-button glow-button"
              disabled={!authState.configured}
              title={!authState.configured ? t.submitPage.githubNotConfigured : undefined}
              type="button"
              onClick={handleGitHubLogin}
            >
              <Github size={16} />
              {t.actions.signInWithGitHub}
            </button>
          )}
        </div>
      </section>

      <div className="public-page-body public-page-body-form">
        <form className="public-submit-form" onSubmit={handleSubmit}>
          {status && statusScope === "auth" ? (
            <SubmitStatus
              issueUrl=""
              proxySettings={proxySettings}
              status={status}
              tone={statusTone}
              t={t}
            />
          ) : null}

          <fieldset
            className="submit-form-fieldset"
            disabled={!authState.authenticated || isSubmitting}
          >
          <section className="submit-form-section">
            <header className="submit-section-heading">
              <h2>{t.submitPage.projectInfoTitle}</h2>
              <p>{t.submitPage.projectInfoDescription}</p>
            </header>
            <FormRow error={touched.name ? validation.name : ""} label={t.form.name}>
              <input
                aria-invalid={Boolean(touched.name && validation.name)}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                maxLength={100}
                placeholder={t.submitPage.namePlaceholder}
                required
              />
            </FormRow>
            <FormRow error={touched.url ? validation.url : ""} label={t.form.url}>
              <input
                aria-invalid={Boolean(touched.url && validation.url)}
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                onBlur={() => {
                  setTouched((current) => ({ ...current, url: true }));
                  setForm((current) => ({ ...current, url: normalizeUrl(current.url) }));
                }}
                placeholder={t.submitPage.urlPlaceholder}
                inputMode="url"
                required
              />
            </FormRow>
            <FormRow error={touched.description ? validation.description : ""} label={t.form.description}>
              <textarea
                aria-invalid={Boolean(touched.description && validation.description)}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                onBlur={() => setTouched((current) => ({ ...current, description: true }))}
                maxLength={1000}
                placeholder={t.submitPage.descriptionPlaceholder}
                rows={5}
                required
              />
            </FormRow>
            <FormRow label={t.form.tags}>
              <input
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                placeholder={t.form.tagsPlaceholder}
              />
            </FormRow>
          </section>

          <section className="submit-form-section submit-category-section">
            <header className="submit-section-heading">
              <h2>{t.submitPage.categoryLabel}</h2>
              <p>{t.submitPage.categoryDescription}</p>
            </header>
            <div className="category-radio-grid">
              {categories.map((category) => (
                <label className="radio-item" key={category.value}>
                  <input
                    checked={form.category === category.value}
                    name="category"
                    onChange={() => {
                      setTouched((current) => ({ ...current, category: true }));
                      setForm({ ...form, category: category.value });
                    }}
                    type="radio"
                  />
                  <span>{category.label}</span>
                </label>
              ))}
            </div>
            {touched.category && validation.category ? (
              <span className="submit-field-error">{validation.category}</span>
            ) : null}
          </section>

          </fieldset>

          <div className="submit-form-actions">
            <div className="submit-verification-actions">
              {turnstileConfig?.turnstileEnabled ? (
                <TurnstileWidget
                  language={locale === "zh" ? "zh-CN" : "en"}
                  onError={handleTurnstileError}
                  onExpire={handleTurnstileExpire}
                  onLoadError={handleTurnstileLoadError}
                  onTokenChange={handleTurnstileTokenChange}
                  resetKey={turnstileResetKey}
                  siteKey={turnstileConfig.turnstileSiteKey}
                />
              ) : null}
              <button
                className="primary-button submit-submit-button"
                disabled={
                  !authState.configured || !authState.authenticated || isSubmitting
                  || !isFormValid || cooldownSeconds > 0
                }
                type="submit"
              >
                {cooldownSeconds > 0
                  ? t.submitPage.waitSeconds(cooldownSeconds)
                  : t.actions.submit}
              </button>
              <p>{t.submitPage.submitHint}</p>
            </div>
          </div>

          {status && statusScope === "submit" ? (
            <SubmitStatus
              detail={submittedName}
              actionLabel={resultKind === "existing"
                ? t.submitPage.viewExistingTool
                : t.actions.openIssue}
              issueUrl={issueUrl}
              proxySettings={proxySettings}
              status={status}
              tone={statusTone}
              t={t}
            />
          ) : null}
        </form>

        <section className="submit-guide-section">
          <div className="submit-guide-intro">
            <h2>{t.submitPage.guideIntroTitle}</h2>
            <p>{t.submitPage.guideIntroDescription}</p>
          </div>
          <div className="submit-guide-grid">
            <InfoPanel title={t.submitPage.guideTitle} description={t.submitPage.guideDescription} />
            <InfoPanel title={t.submitPage.guideContentTitle} description={t.submitPage.guideContentDescription} />
            <InfoPanel title={t.submitPage.guideReviewTitle} description={t.submitPage.guideReviewDescription} />
            <InfoPanel title={t.submitPage.guideAfterTitle} description={t.submitPage.guideAfterDescription} />
          </div>
        </section>
      </div>
    </main>
  );
}

function SubmitStatus({
  actionLabel,
  detail,
  issueUrl,
  proxySettings,
  status,
  t,
  tone
}: {
  actionLabel?: string;
  detail?: string;
  issueUrl: string;
  proxySettings: ProxySettings;
  status: string;
  t: Messages;
  tone: StatusTone;
}) {
  return (
    <div className={`submit-status is-${tone}`} role="status">
      <span className="submit-status-content">
        <span className="submit-status-icon" aria-hidden="true">
          {tone === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
        </span>
        <span className="submit-status-message">
          {detail ? <strong>{detail}</strong> : null}
          <span>{status}</span>
        </span>
      </span>
      {issueUrl ? (
        <a
          className="ghost-button compact submit-status-link"
          href={proxifyUrl(issueUrl, proxySettings)}
          target="_blank"
          rel="noreferrer"
        >
          {actionLabel ?? t.actions.openIssue}
          <ArrowUpRight size={14} />
        </a>
      ) : null}
    </div>
  );
}

function FormRow({
  children,
  error,
  label
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="submit-form-row">
      <span>{label}</span>
      <span className="submit-form-control">
        {children}
        {error ? <span className="submit-field-error">{error}</span> : null}
      </span>
    </label>
  );
}

function InfoPanel({ description, title }: { description: string; title: string }) {
  return (
    <article className="info-panel has-no-icon">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
