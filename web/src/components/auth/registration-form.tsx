"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, EyeOff, Check, ArrowLeft, ArrowRight, ShieldCheck, UserRound, BriefcaseBusiness } from "lucide-react";
import type { RegistrationRequest } from "../../lib/contracts/registration";
import { RegistrationRequestSchema } from "../../lib/contracts/registration";
import { ApiClientError, apiPost } from "../../lib/client/api-client";
import { Button, buttonVariants } from "../ui/button";

type Role = "BORROWER" | "INVESTOR";
type Fields = Record<string, string>;
type GeoModule = typeof import("@geothai/core");
type GeoProvince = ReturnType<GeoModule["provinces"]>[number];
type GeoDistrict = ReturnType<GeoModule["districts"]>[number];
type GeoSubdistrict = ReturnType<GeoModule["subdistricts"]>[number];
interface RegistrationResult { id: string; email: string; roles: string[] }

const steps = ["Account type", "Your details", "Review"];
const initialFields: Fields = { email: "", password: "", legalName: "", phone: "", line1: "", line2: "", displayName: "" };

function ProgressSteps({ current }: { current: number }) {
  return <ol className="grid grid-cols-3 gap-2" aria-label={`Step ${current} of 3`}>
    {steps.map((label, index) => {
      const number = index + 1;
      const complete = number < current;
      const active = number === current;
      return <li key={label} aria-current={active ? "step" : undefined} className="min-w-0">
        <div className={`h-1.5 rounded-full ${complete || active ? "bg-[#1783c1]" : "bg-muted"}`} />
        <p className={`mt-2 truncate text-xs ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {complete ? <Check aria-hidden="true" className="mr-1 inline size-3.5" /> : null}{label}
        </p>
      </li>;
    })}
  </ol>;
}

function Field({ label, name, value, onChange, ...props }: {
  label: string; name: string; value: string; onChange: (name: string, value: string) => void;
  type?: string; autoComplete?: string; required?: boolean; maxLength?: number; minLength?: number; inputMode?: "text" | "tel" | "email" | "numeric";
}) {
  const id = `register-${name}`;
  return <div className="grid gap-1.5">
    <label htmlFor={id} className="text-sm font-medium">{label}{props.required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}</label>
    <input id={id} name={name} value={value} onChange={(event) => onChange(name, event.target.value)} {...props}
      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
    />
  </div>;
}

export function RegistrationForm() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState<Fields>(initialFields);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoModule | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [provinceCode, setProvinceCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [subdistrictCode, setSubdistrictCode] = useState("");
  const [postalCode, setPostalCode] = useState("");

  useEffect(() => {
    if (!roles.includes("BORROWER") || geo) return;
    let active = true;
    import("@geothai/core").then((module) => { if (active) setGeo(module); })
      .catch(() => { if (active) setGeoError(true); });
    return () => { active = false; };
  }, [roles, geo]);

  const provinces = useMemo(() => geo?.provinces() ?? [], [geo]);
  const districts = useMemo(() => provinceCode ? geo?.districts(provinceCode) ?? [] : [], [geo, provinceCode]);
  const subdistricts = useMemo(() => districtCode ? geo?.subdistricts(districtCode) ?? [] : [], [geo, districtCode]);
  const selectedSubdistrict = useMemo(() => subdistrictCode ? geo?.subdistrict(subdistrictCode) : undefined, [geo, subdistrictCode]);
  const postalCodes = selectedSubdistrict?.postal_codes ?? [];

  function changeField(name: string, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    setError(null);
  }
  function toggleRole(role: Role) {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
    setError(null);
  }
  function describeArea(nameEn: string, nameTh: string) { return `${nameEn} — ${nameTh}`; }

  function buildPayload(): RegistrationRequest | null {
    const email = fields.email.trim().toLowerCase();
    const location = selectedSubdistrict && geo ? geo.address(selectedSubdistrict.code) : undefined;
    const payload = {
      email,
      password: fields.password,
      roles,
      ...(roles.includes("BORROWER") ? {
        borrowerProfile: {
          legalName: fields.legalName.trim(),
          phone: fields.phone.trim() || null,
          address: {
            schema_version: "borrower_profile_address.v1" as const,
            line1: fields.line1.trim(),
            line2: fields.line2.trim() || null,
            subdistrict: location?.subdistrict.name_en ?? null,
            district: location?.district.name_en ?? null,
            province: location?.province.name_en ?? null,
            postal_code: postalCode || null,
            country_code: "TH" as const,
          },
        },
      } : {}),
      ...(roles.includes("INVESTOR") ? { investorProfile: { displayName: fields.displayName.trim() } } : {}),
    };
    const result = RegistrationRequestSchema.safeParse(payload);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first.path.join(".");
      setError(path.includes("email") ? "Enter a valid email address to use for sign-in." :
        path.includes("password") ? "Use a password between 12 and 128 characters." :
          path.includes("address") ? "Complete your street and Thai address selections." :
            "Check the required profile details and try again.");
      return null;
    }
    return result.data;
  }

  function continueToDetails() {
    if (!roles.length) { setError("Choose at least one account type to continue."); return; }
    setError(null);
    setStep(2);
  }
  function continueToReview() {
    if (!buildPayload()) return;
    if (roles.includes("BORROWER") && (!provinceCode || !districtCode || !subdistrictCode || !postalCode)) {
      setError("Choose your province, district, subdistrict, and postal code."); return;
    }
    setError(null);
    setStep(3);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const payload = buildPayload();
    if (!payload) { setStep(2); return; }
    setPending(true);
    setError(null);
    try {
      const result = await apiPost<RegistrationResult, RegistrationRequest>("/api/auth/register", payload);
      setRegisteredEmail(result.data.email);
      setFields(initialFields);
      setRoles([]);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.code === "EMAIL_ALREADY_REGISTERED") {
        setError("This email already has a NEXUS account. Sign in to continue.");
      } else if (requestError instanceof ApiClientError) {
        setError(requestError.message);
      } else {
        setError("We could not create your account. Your details are still here; check your connection and retry.");
      }
      setStep(2);
    } finally {
      setPending(false);
    }
  }

  if (registeredEmail) return <section className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-9" aria-labelledby="register-success" role="status" aria-live="polite">
    <div className="mb-5 grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Check aria-hidden="true" /></div>
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1783c1]">Account created</p>
    <h1 id="register-success" className="mt-2 text-3xl font-semibold tracking-tight">You’re ready to sign in.</h1>
    <p className="mt-3 leading-7 text-muted-foreground">Your account for <strong className="text-foreground">{registeredEmail}</strong> is active. Use the email and password you just created.</p>
    <Link className={`${buttonVariants({ size: "lg" })} mt-7 w-full bg-[#0a3c6e] text-white hover:bg-[#082f56]`} href="/login">Continue to sign in</Link>
    <p className="mt-4 text-sm text-muted-foreground">Email verification is not required for MVP registration.</p>
  </section>;

  const location = selectedSubdistrict && geo ? geo.address(selectedSubdistrict.code) : undefined;
  const chosenRoles = roles.map((role) => role === "BORROWER" ? "Borrower" : "Investor").join(" and ");

  return <section className="w-full max-w-2xl rounded-2xl border bg-card p-5 shadow-xl shadow-black/5 sm:p-8" aria-labelledby="register-title">
    <header className="mb-7">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1783c1]">A clearer way forward</p>
      <h1 id="register-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Create your NEXUS account</h1>
      <p className="mt-3 max-w-prose leading-6 text-muted-foreground">Set up the workspace that fits you. We use this email for sign-in and account updates. Passwords must be 12–128 characters.</p>
    </header>

    <ProgressSteps current={step} />

    <form className="mt-7 grid gap-6" onSubmit={handleSubmit} noValidate>
      {step === 1 ? <fieldset className="grid gap-3">
        <legend className="mb-1 text-base font-semibold">How will you use NEXUS?</legend>
        <p className="mb-1 text-sm text-muted-foreground">You can choose both. You can add another workspace later.</p>
        {(["BORROWER", "INVESTOR"] as const).map((role) => {
          const selected = roles.includes(role);
          const Icon = role === "BORROWER" ? UserRound : BriefcaseBusiness;
          return <label key={role} className={`flex min-h-20 cursor-pointer items-center gap-4 rounded-xl border p-4 transition ${selected ? "border-[#1783c1] bg-[#1783c1]/5 ring-1 ring-[#1783c1]" : "hover:border-[#1783c1]/60"}`}>
            <input type="checkbox" className="size-4 accent-[#1783c1]" checked={selected} onChange={() => toggleRole(role)} aria-label={`${role === "BORROWER" ? "Borrower" : "Investor"} account`} />
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-[#0a3c6e] dark:text-sky-300"><Icon aria-hidden="true" className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{role === "BORROWER" ? "Borrower account" : "Investor account"}</span><span className="mt-0.5 block text-sm text-muted-foreground">{role === "BORROWER" ? "Apply for a loan and manage repayments." : "Explore opportunities and follow your portfolio."}</span></span>
            {selected ? <Check aria-hidden="true" className="size-5 text-[#1783c1]" /> : null}
          </label>;
        })}
        <p className="mt-2 flex gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Administrator access is provisioned securely by an administrator.</p>
        <Button type="button" size="lg" className="mt-2 w-full bg-[#0a3c6e] text-white hover:bg-[#082f56] sm:w-auto" onClick={continueToDetails}>Continue <ArrowRight aria-hidden="true" className="size-4" /></Button>
      </fieldset> : null}

      {step === 2 ? <div className="grid gap-6">
        <div className="grid gap-4 rounded-xl border p-4 sm:p-5">
          <div><h2 className="font-semibold">Sign-in details</h2><p className="mt-1 text-sm text-muted-foreground">We use this email for sign-in and account updates.</p></div>
          <Field label="Email address" name="email" type="email" autoComplete="email" required maxLength={254} value={fields.email} onChange={changeField} />
          <div className="grid gap-1.5">
            <label htmlFor="register-password" className="text-sm font-medium">Password <span className="text-destructive" aria-hidden="true">*</span></label>
            <div className="relative"><input id="register-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={fields.password} onChange={(event) => changeField("password", event.target.value)} aria-describedby="register-password-help" className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-12 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <button type="button" className="absolute inset-y-0 right-1 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}</button>
            </div>
            <p id="register-password-help" className="text-xs leading-5 text-muted-foreground">Use 12–128 characters. A passphrase is often easier to remember and harder to guess.</p>
          </div>
        </div>

        {roles.includes("BORROWER") ? <fieldset className="grid gap-4 rounded-xl border p-4 sm:p-5">
          <div><legend className="font-semibold">Borrower details</legend><p className="mt-1 text-sm text-muted-foreground">Your legal name and address help us keep your application information accurate.</p></div>
          <Field label="Full legal name" name="legalName" value={fields.legalName} onChange={changeField} autoComplete="name" required minLength={2} maxLength={150} />
          <Field label="Phone number (optional)" name="phone" value={fields.phone} onChange={changeField} type="tel" autoComplete="tel" maxLength={30} />
          <Field label="Street address" name="line1" value={fields.line1} onChange={changeField} autoComplete="address-line1" required maxLength={255} />
          <Field label="Address line 2 (optional)" name="line2" value={fields.line2} onChange={changeField} autoComplete="address-line2" maxLength={255} />
          {geoError ? <p role="alert" className="text-sm text-destructive">Thai address data could not load. Check your connection and try again.</p> : null}
          {!geo && !geoError ? <p className="text-sm text-muted-foreground" role="status">Loading Thailand address list…</p> : null}
          {geo ? <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5"><label htmlFor="register-province" className="text-sm font-medium">Province <span className="text-destructive" aria-hidden="true">*</span></label><select id="register-province" required value={provinceCode} onChange={(event) => { setProvinceCode(event.target.value); setDistrictCode(""); setSubdistrictCode(""); setPostalCode(""); }} autoComplete="address-level1" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select province</option>{provinces.map((province: GeoProvince) => <option key={province.code} value={province.code}>{describeArea(province.name_en, province.name_th)}</option>)}</select></div>
            <div className="grid min-w-0 gap-1.5"><label htmlFor="register-district" className="text-sm font-medium">District <span className="text-destructive" aria-hidden="true">*</span></label><select id="register-district" required disabled={!provinceCode} value={districtCode} onChange={(event) => { setDistrictCode(event.target.value); setSubdistrictCode(""); setPostalCode(""); }} autoComplete="address-level2" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select district</option>{districts.map((district: GeoDistrict) => <option key={district.code} value={district.code}>{describeArea(district.name_en, district.name_th)}</option>)}</select></div>
            <div className="grid min-w-0 gap-1.5"><label htmlFor="register-subdistrict" className="text-sm font-medium">Subdistrict <span className="text-destructive" aria-hidden="true">*</span></label><select id="register-subdistrict" required disabled={!districtCode} value={subdistrictCode} onChange={(event) => { const code = event.target.value; const item = geo.subdistrict(code); setSubdistrictCode(code); setPostalCode(item?.postal_codes.length === 1 ? item.postal_codes[0] : ""); }} className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select subdistrict</option>{subdistricts.map((subdistrict: GeoSubdistrict) => <option key={subdistrict.code} value={subdistrict.code}>{describeArea(subdistrict.name_en, subdistrict.name_th)}</option>)}</select></div>
            <div className="grid min-w-0 gap-1.5"><label htmlFor="register-postal" className="text-sm font-medium">Postal code <span className="text-destructive" aria-hidden="true">*</span></label><select id="register-postal" required disabled={!subdistrictCode} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select postal code</option>{postalCodes.map((postal: string) => <option key={postal} value={postal}>{postal}</option>)}</select></div>
            {location ? <p className="text-xs text-muted-foreground sm:col-span-2">{location.province.name_en}, Thailand</p> : null}
          </div> : null}
        </fieldset> : null}

        {roles.includes("INVESTOR") ? <fieldset className="grid gap-4 rounded-xl border p-4 sm:p-5"><div><legend className="font-semibold">Investor details</legend><p className="mt-1 text-sm text-muted-foreground">This name is shown in your investor workspace.</p></div><Field label="Display name" name="displayName" value={fields.displayName} onChange={changeField} autoComplete="name" required minLength={2} maxLength={60} /></fieldset> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" size="lg" onClick={() => { setError(null); setStep(1); }}><ArrowLeft aria-hidden="true" className="size-4" />Back</Button><Button type="button" size="lg" disabled={roles.includes("BORROWER") && !geo} className="bg-[#0a3c6e] text-white hover:bg-[#082f56]" onClick={continueToReview}>Review details <ArrowRight aria-hidden="true" className="size-4" /></Button></div>
      </div> : null}

      {step === 3 ? <div className="grid gap-5">
        <div><h2 className="text-lg font-semibold">Review your account</h2><p className="mt-1 text-sm text-muted-foreground">Check these details before creating your account.</p></div>
        <dl className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-2 sm:p-5">
          <div><dt className="text-muted-foreground">Workspace</dt><dd className="mt-1 font-medium">{chosenRoles}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{fields.email.trim().toLowerCase()}</dd></div>
          {roles.includes("BORROWER") ? <><div><dt className="text-muted-foreground">Legal name</dt><dd className="mt-1 font-medium">{fields.legalName}</dd></div><div><dt className="text-muted-foreground">Address</dt><dd className="mt-1 font-medium">{[fields.line1, location?.subdistrict.name_en, location?.district.name_en, location?.province.name_en, postalCode].filter(Boolean).join(", ")}</dd></div></> : null}
          {roles.includes("INVESTOR") ? <div><dt className="text-muted-foreground">Display name</dt><dd className="mt-1 font-medium">{fields.displayName}</dd></div> : null}
        </dl>
        <p className="rounded-lg bg-muted/50 p-3 text-sm leading-6 text-muted-foreground">Creating an account does not submit a loan application or make an investment. You can review each action before it happens.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" size="lg" onClick={() => { setError(null); setStep(2); }}><ArrowLeft aria-hidden="true" className="size-4" />Edit details</Button><Button type="submit" size="lg" disabled={pending} className="bg-[#0a3c6e] text-white hover:bg-[#082f56]">{pending ? "Creating your account…" : "Create account"}</Button></div>
      </div> : null}

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {step > 1 && step < 3 ? <p className="text-xs text-muted-foreground">Fields marked * are required. Your information is kept if a request needs to be retried.</p> : null}
    </form>
    <p className="mt-7 border-t pt-5 text-sm text-muted-foreground">Already registered? <Link className="font-semibold text-[#0a3c6e] underline-offset-4 hover:underline dark:text-sky-300" href="/login">Sign in</Link></p>
  </section>;
}
