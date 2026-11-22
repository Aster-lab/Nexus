"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileCheck2, Send } from "lucide-react";
import { useAuth } from "../auth/auth-provider";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  BORROWER_APPLICATION_TERMS,
  buildBorrowerApplicationSnapshot,
  clearBorrowerApplicationFormDraft,
  createApplicationSubmissionLock,
  createBorrowerApplicationDraft,
  getApplicationErrorMessage,
  loadBorrowerApplicationFormDraft,
  parseBahtAmountToSatang,
  saveBorrowerApplicationFormDraft,
  submitBorrowerApplicationRequest,
  updateBorrowerApplication,
  validateBorrowerApplicationForm,
  type BorrowerApplicationFormErrors,
  type BorrowerApplicationFormValues,
} from "../../lib/client/borrower-applications";
import { formatDashboardStatus, formatSatang, notifyBorrowerDashboardMutationComplete } from "../../lib/client/borrower-dashboard";
import { BORROWER_COMPANY_TYPES } from "../../lib/contracts/application";

type FormStep = "edit" | "review" | "success" | "submitted";
type ApplicationDraftResult = { id: string; status: string; borrowerProfileId: string };
type GeoModule = typeof import("@geothai/core");
type GeoProvince = ReturnType<GeoModule["provinces"]>[number];
type GeoDistrict = ReturnType<GeoModule["districts"]>[number];
type GeoSubdistrict = ReturnType<GeoModule["subdistricts"]>[number];

const PURPOSE_OPTIONS = [
  { value: "business", label: "Business" },
  { value: "education", label: "Education" },
  { value: "medical", label: "Medical or healthcare" },
  { value: "personal", label: "Personal" },
  { value: "home", label: "Home or housing" },
  { value: "other", label: "Other" },
] as const;

const COMPANY_TYPE_LABELS: Record<typeof BORROWER_COMPANY_TYPES[number], string> = {
  SOLE_PROPRIETORSHIP: "Sole proprietorship",
  PARTNERSHIP: "Partnership",
  PRIVATE_LIMITED_COMPANY: "Private limited company",
  PUBLIC_LIMITED_COMPANY: "Public limited company",
  COOPERATIVE: "Cooperative or community enterprise",
  OTHER: "Other",
};

const inputClass = "h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring";

function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return <div className="grid gap-1.5">
    <label className="text-sm font-semibold text-foreground" htmlFor={id}>
      {label} {required ? <span className="text-destructive" aria-hidden="true">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
    </label>
    {children}
    {hint ? <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    {error ? <p className="text-sm font-medium text-destructive" id={`${id}-error`} role="alert">{error}</p> : null}
  </div>;
}

function TextInput({
  id,
  value,
  onChange,
  error,
  hintId,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; error?: string; hintId?: string }) {
  return <input
    className={`${inputClass} ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
    id={id}
    value={value}
    onChange={onChange}
    aria-invalid={Boolean(error)}
    aria-required={props.required}
    aria-describedby={[hintId, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
    {...props}
  />;
}

function SelectInput({
  id,
  value,
  onChange,
  error,
  required,
  disabled,
  autoComplete,
  children,
}: {
  id: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  children: ReactNode;
}) {
  return <select
    className={`${inputClass} ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
    id={id}
    value={value}
    onChange={onChange}
    disabled={disabled}
    autoComplete={autoComplete}
    aria-invalid={Boolean(error)}
    aria-required={required}
    aria-describedby={error ? `${id}-error` : undefined}
  >{children}</select>;
}

export function BorrowerApplicationForm() {
  const { identity } = useAuth();
  const [step, setStep] = useState<FormStep>("edit");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<BorrowerApplicationFormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationDraftResult | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [formDraftOwner, setFormDraftOwner] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [geo, setGeo] = useState<GeoModule | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [values, setValues] = useState<BorrowerApplicationFormValues>(() => ({
    legalName: identity?.borrowerProfile?.legalName ?? "",
    phone: identity?.borrowerProfile?.phone ?? "",
    addressLine1: "",
    addressLine2: "",
    subdistrict: "",
    district: "",
    province: "",
    postalCode: "",
    countryCode: "TH",
    employmentStatus: "",
    employerName: "",
    occupation: "",
    monthsInRole: "",
    companyName: "",
    companyType: "",
    amountBaht: "",
    termMonths: "",
    purpose: "",
  }));
  const [submissionLock] = useState(() => createApplicationSubmissionLock());

  useEffect(() => {
    let active = true;
    void import("@geothai/core").then((module) => {
      if (active) setGeo(module);
    }).catch(() => {
      if (active) setGeoError(true);
    });
    return () => { active = false; };
  }, []);

  const provinces = useMemo(() => geo?.provinces() ?? [], [geo]);
  const selectedProvince = useMemo(
    () => provinces.find((province: GeoProvince) => province.name_en === values.province),
    [provinces, values.province],
  );
  const legacyProvinceValue = values.province && !selectedProvince ? `legacy:${values.province}` : "";
  const districts = useMemo(
    () => selectedProvince && geo ? geo.districts(selectedProvince.code) : [],
    [geo, selectedProvince],
  );
  const selectedDistrict = useMemo(
    () => districts.find((district: GeoDistrict) => district.name_en === values.district),
    [districts, values.district],
  );
  const legacyDistrictValue = values.district && !selectedDistrict ? `legacy:${values.district}` : "";
  const subdistricts = useMemo(
    () => selectedDistrict && geo ? geo.subdistricts(selectedDistrict.code) : [],
    [geo, selectedDistrict],
  );
  const selectedSubdistrict = useMemo(
    () => subdistricts.find((subdistrict: GeoSubdistrict) => subdistrict.name_en === values.subdistrict),
    [subdistricts, values.subdistrict],
  );
  const legacySubdistrictValue = values.subdistrict && !selectedSubdistrict ? `legacy:${values.subdistrict}` : "";
  const postalCodes = selectedSubdistrict?.postal_codes ?? [];

  useEffect(() => {
    const userId = identity?.id;
    if (!userId) return;
    const profileName = identity.borrowerProfile?.legalName ?? "";
    const profilePhone = identity.borrowerProfile?.phone ?? "";
    queueMicrotask(() => {
      const saved = loadBorrowerApplicationFormDraft(userId);
      if (saved) {
        setValues(saved);
        setRestoredDraft(true);
      } else {
        setValues((current) => ({
          ...current,
          legalName: current.legalName || profileName,
          phone: current.phone || profilePhone,
        }));
        setRestoredDraft(false);
      }
      setFormDraftOwner(userId);
    });
  }, [identity?.borrowerProfile?.legalName, identity?.borrowerProfile?.phone, identity?.id]);

  useEffect(() => {
    if (!identity?.id || formDraftOwner !== identity.id || draft || step === "success" || step === "submitted") return;
    saveBorrowerApplicationFormDraft(identity.id, values);
  }, [draft, formDraftOwner, identity?.id, step, values]);

  function update<K extends keyof BorrowerApplicationFormValues>(field: K, value: BorrowerApplicationFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setApiError(null);
  }

  function reviewApplication() {
    const nextErrors = validateBorrowerApplicationForm(values);
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length === 0) setStep("review");
  }

  async function saveDraft() {
    const nextErrors = validateBorrowerApplicationForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStep("edit");
      return;
    }

    const outcome = await submissionLock(async () => {
      setSubmitting(true);
      setApiError(null);
      try {
        const snapshot = buildBorrowerApplicationSnapshot(values);
        const response = draft
          ? await updateBorrowerApplication(draft.id, snapshot)
          : await createBorrowerApplicationDraft(snapshot);
        if (identity?.id) clearBorrowerApplicationFormDraft(identity.id);
        if (!draft) {
          setRestoredDraft(false);
          setDraft(response.data);
        } else {
          setDraft((current) => current ? { ...current, status: response.data.status } : current);
        }
        setStep("success");
        notifyBorrowerDashboardMutationComplete();
        return response.data;
      } catch (error) {
        setApiError(getApplicationErrorMessage(error));
        return null;
      } finally {
        setSubmitting(false);
      }
    });
    if (!outcome.submitted) return;
  }

  async function submitSavedApplication() {
    if (!draft || submitting) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const response = await submitBorrowerApplicationRequest(draft.id);
      setDraft((current) => current ? { ...current, status: response.data.status } : current);
      setStep("submitted");
      setConfirmSubmit(false);
      notifyBorrowerDashboardMutationComplete();
    } catch (error) {
      setApiError(getApplicationErrorMessage(error));
      setConfirmSubmit(false);
    } finally {
      setSubmitting(false);
    }
  }

  const amountSatang = parseBahtAmountToSatang(values.amountBaht);

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/borrower/applications">
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to applications
    </Link>

    <header>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">Borrower workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
        {step === "submitted" ? "Application submitted" : step === "success" ? "Draft saved" : "Create a loan application"}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {step === "submitted"
          ? "Your application was submitted. The review team will update its status when the review is complete."
          : step === "success"
            ? "Your draft is saved. Choose whether to submit it now or continue editing."
          : "Add your details and loan request, then review everything before saving your draft."}
      </p>
    </header>

    {(step === "success" || step === "submitted") && draft ? <Card className="border-success/25">
      <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="size-6" aria-hidden="true" /></span>
        <div className="min-w-0">
          <Badge variant={step === "submitted" ? "success" : "secondary"}>{formatDashboardStatus(draft.status)}</Badge>
          <h2 className="mt-3 text-xl font-bold text-foreground">Application {draft.id.slice(0, 8)}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{step === "submitted" ? "Your application is now with the review team. Creating a draft alone does not approve or fund a loan." : "The application is saved as a draft. It will not be reviewed until you submit it."}</p>
          {step === "submitted" ? <Link className={buttonVariants({ variant: "default", className: "mt-5" })} href={`/borrower/applications/${draft.id}`}>View submitted application <ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
        </div>
      </CardContent>
    </Card> : null}

    {step !== "success" && step !== "submitted" ? <Card>
      <CardHeader>
        <CardTitle>{step === "edit" ? "Application information" : "Review your application"}</CardTitle>
        <CardDescription>
            {step === "edit"
            ? draft ? "Update the saved draft. You can submit it when the details are ready." : "Unsubmitted details are saved in this browser tab and restored after refresh. They are cleared after the draft is successfully created."
            : draft ? "Review your changes before updating the saved draft." : "Check these details before saving your application as a draft."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {restoredDraft && step === "edit" ? <p className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary" role="status">We restored your unfinished application so you can pick up where you left off.</p> : null}
        {apiError ? <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{apiError}</div> : null}

        {step === "edit" ? <form className="space-y-8" onSubmit={(event) => event.preventDefault()} noValidate>
          <section className="space-y-4" aria-labelledby="app-borrower-title">
            <div><h2 className="text-base font-semibold text-foreground" id="app-borrower-title">Borrower details</h2><p className="mt-1 text-sm text-muted-foreground">These fields are required by the current application request contract.</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="legalName" label="Legal name" required error={errors.legalName}>
                <TextInput id="legalName" required autoComplete="name" value={values.legalName} onChange={(event) => update("legalName", event.target.value)} error={errors.legalName} />
              </FormField>
              <FormField id="phone" label="Phone number" error={errors.phone}>
                <TextInput id="phone" type="tel" autoComplete="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} error={errors.phone} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="addressLine1" label="Address line 1" required error={errors.addressLine1}>
                <TextInput id="addressLine1" required autoComplete="address-line1" value={values.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} error={errors.addressLine1} />
              </FormField>
              <FormField id="addressLine2" label="Address line 2">
                <TextInput id="addressLine2" autoComplete="address-line2" value={values.addressLine2} onChange={(event) => update("addressLine2", event.target.value)} />
              </FormField>
              <FormField id="province" label="Province">
                <SelectInput id="province" value={selectedProvince?.code ?? legacyProvinceValue} autoComplete="address-level1" disabled={!geo} onChange={(event) => {
                  if (event.target.value === legacyProvinceValue) return;
                  const province = provinces.find((item: GeoProvince) => item.code === event.target.value);
                  setValues((current) => ({ ...current, province: province?.name_en ?? "", district: "", subdistrict: "", postalCode: "" }));
                  setErrors((current) => ({ ...current, province: undefined, district: undefined, subdistrict: undefined, postalCode: undefined }));
                  setApiError(null);
                }}>
                  <option value="">Select province (optional)</option>
                  {legacyProvinceValue ? <option value={legacyProvinceValue}>Previously saved: {values.province}</option> : null}
                  {provinces.map((province: GeoProvince) => <option key={province.code} value={province.code}>{province.name_en} — {province.name_th}</option>)}
                </SelectInput>
              </FormField>
              <FormField id="district" label="District">
                <SelectInput id="district" value={selectedDistrict?.code ?? legacyDistrictValue} autoComplete="address-level2" disabled={!selectedProvince} onChange={(event) => {
                  if (event.target.value === legacyDistrictValue) return;
                  const district = districts.find((item: GeoDistrict) => item.code === event.target.value);
                  setValues((current) => ({ ...current, district: district?.name_en ?? "", subdistrict: "", postalCode: "" }));
                  setErrors((current) => ({ ...current, district: undefined, subdistrict: undefined, postalCode: undefined }));
                  setApiError(null);
                }}>
                  <option value="">Select district (optional)</option>
                  {legacyDistrictValue ? <option value={legacyDistrictValue}>Previously saved: {values.district}</option> : null}
                  {districts.map((district: GeoDistrict) => <option key={district.code} value={district.code}>{district.name_en} — {district.name_th}</option>)}
                </SelectInput>
              </FormField>
              <FormField id="subdistrict" label="Subdistrict">
                <SelectInput id="subdistrict" value={selectedSubdistrict?.code ?? legacySubdistrictValue} autoComplete="address-level3" disabled={!selectedDistrict} onChange={(event) => {
                  if (event.target.value === legacySubdistrictValue) return;
                  const subdistrict = subdistricts.find((item: GeoSubdistrict) => item.code === event.target.value);
                  setValues((current) => ({
                    ...current,
                    subdistrict: subdistrict?.name_en ?? "",
                    postalCode: subdistrict?.postal_codes.length === 1 ? subdistrict.postal_codes[0] : "",
                  }));
                  setErrors((current) => ({ ...current, subdistrict: undefined, postalCode: undefined }));
                  setApiError(null);
                }}>
                  <option value="">Select subdistrict (optional)</option>
                  {legacySubdistrictValue ? <option value={legacySubdistrictValue}>Previously saved: {values.subdistrict}</option> : null}
                  {subdistricts.map((subdistrict: GeoSubdistrict) => <option key={subdistrict.code} value={subdistrict.code}>{subdistrict.name_en} — {subdistrict.name_th}</option>)}
                </SelectInput>
              </FormField>
              <FormField id="postalCode" label="Postal code">
                <SelectInput id="postalCode" value={values.postalCode} autoComplete="postal-code" disabled={!selectedSubdistrict} onChange={(event) => update("postalCode", event.target.value)}>
                  <option value="">Select postal code (optional)</option>
                  {values.postalCode && !postalCodes.includes(values.postalCode) ? <option value={values.postalCode}>Previously saved: {values.postalCode}</option> : null}
                  {postalCodes.map((postalCode: string) => <option key={postalCode} value={postalCode}>{postalCode}</option>)}
                </SelectInput>
              </FormField>
              <FormField id="countryCode" label="Country code">
                <TextInput id="countryCode" autoComplete="country" value={values.countryCode} onChange={(event) => update("countryCode", event.target.value)} />
              </FormField>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="app-employment-title">
            <div><h2 className="text-base font-semibold text-foreground" id="app-employment-title">Employment</h2><p className="mt-1 text-sm text-muted-foreground">Employment status is required; remaining employment fields are optional in the API schema.</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="employmentStatus" label="Employment status" required error={errors.employmentStatus}>
                <TextInput id="employmentStatus" required value={values.employmentStatus} onChange={(event) => update("employmentStatus", event.target.value)} error={errors.employmentStatus} />
              </FormField>
              <FormField id="employerName" label="Employer name">
                <TextInput id="employerName" value={values.employerName} onChange={(event) => update("employerName", event.target.value)} />
              </FormField>
              <FormField id="occupation" label="Occupation">
                <TextInput id="occupation" value={values.occupation} onChange={(event) => update("occupation", event.target.value)} />
              </FormField>
              <FormField id="monthsInRole" label="Months in current role" error={errors.monthsInRole}>
                <TextInput id="monthsInRole" type="number" min="0" step="1" value={values.monthsInRole} onChange={(event) => update("monthsInRole", event.target.value)} error={errors.monthsInRole} />
              </FormField>
              <FormField id="companyName" label="Company or business name" error={errors.companyName} hint="Optional. Investors can see this name when it is included in your application.">
                <TextInput id="companyName" maxLength={160} value={values.companyName} onChange={(event) => update("companyName", event.target.value)} error={errors.companyName} />
              </FormField>
              <FormField id="companyType" label="Company or business type" error={errors.companyType}>
                <SelectInput id="companyType" value={values.companyType} onChange={(event) => update("companyType", event.target.value)} error={errors.companyType}>
                  <option value="">Choose a type</option>
                  {BORROWER_COMPANY_TYPES.map((type) => <option key={type} value={type}>{COMPANY_TYPE_LABELS[type]}</option>)}
                </SelectInput>
              </FormField>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="app-loan-title">
            <div><h2 className="text-base font-semibold text-foreground" id="app-loan-title">Requested loan</h2><p className="mt-1 text-sm text-muted-foreground">THB only. The server applies the current platform policy and remains authoritative.</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField id="amountBaht" label="Amount (THB)" required hint="฿1,000–฿50,000; up to two decimal places." error={errors.amountBaht}>
                <TextInput id="amountBaht" required type="text" inputMode="decimal" placeholder="10,000.00" value={values.amountBaht} onChange={(event) => update("amountBaht", event.target.value)} error={errors.amountBaht} hintId="amountBaht-hint" />
              </FormField>
              <FormField id="termMonths" label="Requested term" required error={errors.termMonths}>
                <SelectInput id="termMonths" required value={values.termMonths} onChange={(event) => update("termMonths", event.target.value)} error={errors.termMonths}>
                  <option value="">Choose a term</option>
                  {BORROWER_APPLICATION_TERMS.map((term) => <option key={term} value={String(term)}>{term} months</option>)}
                </SelectInput>
              </FormField>
              <FormField id="purpose" label="Purpose" required error={errors.purpose}>
                <SelectInput id="purpose" required value={values.purpose} onChange={(event) => update("purpose", event.target.value)} error={errors.purpose}>
                  <option value="">Choose a purpose</option>
                  {values.purpose && !PURPOSE_OPTIONS.some((option) => option.value === values.purpose) ? <option value={values.purpose}>Previously saved: {values.purpose}</option> : null}
                  {PURPOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </SelectInput>
              </FormField>
            </div>
            {geoError ? <p className="text-sm text-destructive" role="alert">The Thailand address list could not be loaded. Refresh the page or continue without optional address details.</p> : null}
            {!geo && !geoError ? <p className="text-sm text-muted-foreground" role="status">Loading Thailand address options…</p> : null}
          </section>
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Link className={buttonVariants({ variant: "outline" })} href="/borrower/applications">Cancel</Link>
            <Button type="button" onClick={reviewApplication}>Review details <ArrowRight className="size-4" aria-hidden="true" /></Button>
          </div>
        </form> : null}

        {step === "review" ? <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-background p-4" aria-labelledby="review-borrower-title">
              <h3 className="font-semibold text-foreground" id="review-borrower-title">Borrower and employment</h3>
              <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt><dd className="break-words text-foreground">{values.legalName}</dd>
                <dt className="text-muted-foreground">Phone</dt><dd className="break-words text-foreground">{values.phone.trim() || "Not provided"}</dd>
                <dt className="text-muted-foreground">Address</dt><dd className="break-words text-foreground">{[values.addressLine1, values.addressLine2, values.subdistrict, values.district, values.province, values.postalCode, values.countryCode].map((value) => value.trim()).filter(Boolean).join(", ")}</dd>
                <dt className="text-muted-foreground">Employment</dt><dd className="break-words text-foreground">{values.employmentStatus}</dd>
                <dt className="text-muted-foreground">Employer</dt><dd className="break-words text-foreground">{values.employerName.trim() || "Not provided"}</dd>
                <dt className="text-muted-foreground">Occupation</dt><dd className="break-words text-foreground">{values.occupation.trim() || "Not provided"}</dd>
                {values.companyName.trim() ? <><dt className="text-muted-foreground">Company or business</dt><dd className="break-words text-foreground">{values.companyName.trim()} · {COMPANY_TYPE_LABELS[values.companyType as typeof BORROWER_COMPANY_TYPES[number]] ?? "Type not selected"}</dd></> : null}
              </dl>
            </section>
            <section className="rounded-xl border border-border bg-background p-4" aria-labelledby="review-loan-title">
              <h3 className="font-semibold text-foreground" id="review-loan-title">Requested loan</h3>
              <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Requested amount</dt><dd className="font-semibold tabular-nums text-foreground">{amountSatang === null ? "—" : formatSatang(amountSatang.toString())}</dd>
                <dt className="text-muted-foreground">Term</dt><dd className="text-foreground">{values.termMonths} months</dd>
                <dt className="text-muted-foreground">Purpose</dt><dd className="break-words text-foreground">{values.purpose}</dd>
              </dl>
              <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-xs leading-5 text-muted-foreground">This request creates a draft only. Final eligibility, pricing, and loan terms are determined by the server and the review process.</p>
            </section>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { setStep("edit"); setApiError(null); }} disabled={submitting}><ArrowLeft className="size-4" aria-hidden="true" /> Edit details</Button>
            <Button onClick={() => void saveDraft()} disabled={submitting}>
              <FileCheck2 className="size-4" aria-hidden="true" /> {submitting ? draft ? "Updating draft…" : "Saving draft…" : draft ? "Save draft changes" : "Create draft"}
            </Button>
          </div>
          {submitting ? <p className="text-right text-sm text-muted-foreground" role="status" aria-live="polite">Saving your draft securely…</p> : null}
        </div> : null}
      </CardContent>
    </Card> : null}
    {step === "success" && draft ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="draft-next-step-title" aria-describedby="draft-next-step-description" className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-7">
      <Badge variant="success">Draft saved</Badge>
      <h2 id="draft-next-step-title" className="mt-3 text-xl font-bold">What would you like to do next?</h2>
      <p id="draft-next-step-description" className="mt-2 text-sm leading-6 text-muted-foreground">Submit when you are ready for the review process, or continue editing your saved draft.</p>
      {apiError ? <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{apiError}</p> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button onClick={() => setConfirmSubmit(true)}><Send className="size-4" aria-hidden="true"/>Submit application</Button>
        <Button variant="outline" onClick={() => { setStep("edit"); setApiError(null); }}>Continue editing</Button>
      </div>
      <Link href="/borrower/applications" className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Go to my applications</Link>
    </section></div> : null}
    {confirmSubmit && draft ? <div className="fixed inset-0 z-[130] grid place-items-center bg-black/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setConfirmSubmit(false); }}><section role="dialog" aria-modal="true" aria-labelledby="submit-saved-application-title" aria-describedby="submit-saved-application-description" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"><h2 id="submit-saved-application-title" className="text-lg font-semibold">Submit this application?</h2><p id="submit-saved-application-description" className="mt-2 text-sm leading-6 text-muted-foreground">The review team will receive application {draft.id.slice(0, 8)}. Its status will change only after NEXUS confirms submission.</p>{apiError ? <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{apiError}</p> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={submitting} onClick={() => setConfirmSubmit(false)}>Keep as draft</Button><Button disabled={submitting} onClick={() => void submitSavedApplication()}>{submitting ? "Submitting…" : "Confirm submission"}</Button></div></section></div> : null}
  </main>;
}
