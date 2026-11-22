"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiGet, apiPatch, apiPost } from "../../lib/client/api-client";
import { useAuth } from "./auth-provider";
import { ThaiAddressFields } from "../shared/thai-address-fields";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type BorrowerAddress = {
  schema_version?: string;
  line1?: string | null;
  line2?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};
type ProfileData = {
  id: string;
  email: string;
  roles: string[];
  borrowerProfile: { id: string; legalName: string; phone: string | null; address: BorrowerAddress } | null;
  investorProfile: { id: string; displayName: string } | null;
};
type BorrowerFields = {
  legalName: string; phone: string; line1: string; line2: string;
  subdistrict: string; district: string; province: string; postalCode: string;
};

const EMPTY_BORROWER: BorrowerFields = { legalName: "", phone: "", line1: "", line2: "", subdistrict: "", district: "", province: "", postalCode: "" };

function borrowerFields(profile: ProfileData["borrowerProfile"]): BorrowerFields {
  const address = profile?.address ?? {};
  return {
    legalName: profile?.legalName ?? "", phone: profile?.phone ?? "", line1: address.line1 ?? "", line2: address.line2 ?? "",
    subdistrict: address.subdistrict ?? "", district: address.district ?? "", province: address.province ?? "", postalCode: address.postal_code ?? "",
  };
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError ? error.message : "We could not save your profile. Please try again.";
}

function ProfileField({ label, value, onChange, required = false, type = "text", maxLength }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; maxLength?: number;
}) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{required ? <span className="text-destructive" aria-hidden="true"> *</span> : null}
    <input className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 font-normal shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" type={type} value={value} required={required} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function ProfilePage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [borrower, setBorrower] = useState<BorrowerFields>(EMPTY_BORROWER);
  const [displayName, setDisplayName] = useState("");
  const [newInvestorName, setNewInvestorName] = useState("");
  const [enrollmentBorrower, setEnrollmentBorrower] = useState<BorrowerFields>(EMPTY_BORROWER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState<"BORROWER" | "INVESTOR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await apiGet<ProfileData>("/api/users/me", { revalidateMs: 0 });
      setProfile(result.data);
      setBorrower(borrowerFields(result.data.borrowerProfile));
      setEnrollmentBorrower(borrowerFields(result.data.borrowerProfile));
      setDisplayName(result.data.investorProfile?.displayName ?? "");
      setNewInvestorName(result.data.investorProfile?.displayName ?? "");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiGet<ProfileData>("/api/users/me", { revalidateMs: 0 }).then((result) => {
      if (!active) return;
      setProfile(result.data);
      setBorrower(borrowerFields(result.data.borrowerProfile));
      setEnrollmentBorrower(borrowerFields(result.data.borrowerProfile));
      setDisplayName(result.data.investorProfile?.displayName ?? "");
      setNewInvestorName(result.data.investorProfile?.displayName ?? "");
    }).catch((requestError: unknown) => {
      if (active) setError(errorMessage(requestError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function addressPayload(fields: BorrowerFields): BorrowerAddress {
    return {
      schema_version: "borrower_profile_address.v1",
      line1: fields.line1.trim(), line2: fields.line2.trim() || null,
      subdistrict: fields.subdistrict.trim() || null, district: fields.district.trim() || null,
      province: fields.province.trim() || null, postal_code: fields.postalCode.trim() || null, country_code: "TH",
    };
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await apiPatch("/api/users/me", {
        ...(profile.borrowerProfile ? { legalName: borrower.legalName, phone: borrower.phone || null, address: addressPayload(borrower) } : {}),
        ...(profile.investorProfile ? { displayName } : {}),
      });
      await refresh();
      await loadProfile();
      setSuccess("Your profile has been updated.");
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally { setSaving(false); }
  }

  async function enableRole(role: "BORROWER" | "INVESTOR", event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profile.roles.includes(role)) return;
    setEnrolling(role); setError(null); setSuccess(null);
    const profilePayload = role === "BORROWER"
      ? { role, profile: { legalName: enrollmentBorrower.legalName.trim(), phone: enrollmentBorrower.phone.trim() || null, address: addressPayload(enrollmentBorrower) } }
      : { role, profile: { displayName: newInvestorName.trim() } };
    try {
      await apiPost("/api/users/me/roles", profilePayload);
      await refresh();
      await loadProfile();
      setSuccess(`${role === "BORROWER" ? "Borrower" : "Investor"} workspace enabled.`);
      router.refresh();
    } catch (enrollmentError) {
      setError(errorMessage(enrollmentError));
    } finally { setEnrolling(null); }
  }

  if (loading) return <main className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-8" aria-busy="true"><div className="h-8 w-48 animate-pulse rounded bg-muted"/><div className="h-64 animate-pulse rounded-xl bg-muted"/></main>;
  if (!profile) return <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8"><h1 className="text-3xl font-bold">Your profile</h1><p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{error ?? "Profile information is unavailable."}</p><Button variant="outline" onClick={() => void loadProfile()}>Retry</Button></main>;

  const canAddBorrower = !profile.roles.includes("BORROWER");
  const canAddInvestor = !profile.roles.includes("INVESTOR");
  const updateBorrower = (key: keyof BorrowerFields, value: string, enrollment = false) => {
    const setter = enrollment ? setEnrollmentBorrower : setBorrower;
    setter((current) => ({ ...current, [key]: value }));
  };
  const updateAddress = (value: { province: string; district: string; subdistrict: string; postalCode: string }, enrollment = false) => {
    const setter = enrollment ? setEnrollmentBorrower : setBorrower;
    setter((current) => ({ ...current, ...value }));
  };

  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
    <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Account</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Your profile</h1><p className="mt-2 text-muted-foreground">Manage your account details and enable another workspace whenever you need it.</p></header>
    {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p> : null}
    {success ? <p className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-4 text-sm text-emerald-800 dark:text-emerald-300" role="status">{success}</p> : null}

    <form onSubmit={saveProfile} className="grid gap-5">
      <Card><CardHeader><CardTitle>Account details</CardTitle><CardDescription>Your sign-in email is {profile.email}. Email changes are not available in this MVP.</CardDescription></CardHeader><CardContent className="grid gap-6">
        {profile.borrowerProfile ? <section className="grid gap-4"><h2 className="text-lg font-semibold">Borrower profile</h2><div className="grid gap-4 sm:grid-cols-2"><ProfileField label="Legal name" value={borrower.legalName} required maxLength={150} onChange={(value) => updateBorrower("legalName", value)}/><ProfileField label="Phone" type="tel" value={borrower.phone} maxLength={30} onChange={(value) => updateBorrower("phone", value)}/><ProfileField label="Street address" value={borrower.line1} required maxLength={255} onChange={(value) => updateBorrower("line1", value)}/><ProfileField label="Address line 2" value={borrower.line2} maxLength={255} onChange={(value) => updateBorrower("line2", value)}/></div><ThaiAddressFields idPrefix="profile" required value={borrower} onChange={(value) => updateAddress(value)}/></section> : null}
        {profile.investorProfile ? <section className="grid gap-4"><h2 className="text-lg font-semibold">Investor profile</h2><ProfileField label="Display name" value={displayName} required maxLength={60} onChange={setDisplayName}/></section> : null}
        <div><Button type="submit" disabled={saving || (!profile.borrowerProfile && !profile.investorProfile)}>{saving ? "Saving…" : "Save profile"}</Button></div>
      </CardContent></Card>
    </form>

    {canAddBorrower || canAddInvestor ? <Card><CardHeader><CardTitle>Add a workspace</CardTitle><CardDescription>Enable another NEXUS role with the profile details it requires. Administrator access cannot be self-enabled.</CardDescription></CardHeader><CardContent className="grid gap-6">
      {canAddBorrower ? <form onSubmit={(event) => void enableRole("BORROWER", event)} className="grid gap-4 rounded-lg border p-4">
        <div><h2 className="font-semibold">Borrower workspace</h2><p className="mt-1 text-sm text-muted-foreground">Apply for loans and manage repayments.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><ProfileField label="Legal name" value={enrollmentBorrower.legalName} required maxLength={150} onChange={(value) => updateBorrower("legalName", value, true)}/><ProfileField label="Phone" type="tel" value={enrollmentBorrower.phone} maxLength={30} onChange={(value) => updateBorrower("phone", value, true)}/><ProfileField label="Street address" value={enrollmentBorrower.line1} required maxLength={255} onChange={(value) => updateBorrower("line1", value, true)}/><ProfileField label="Address line 2" value={enrollmentBorrower.line2} maxLength={255} onChange={(value) => updateBorrower("line2", value, true)}/></div><ThaiAddressFields idPrefix="enroll-borrower" required value={enrollmentBorrower} onChange={(value) => updateAddress(value, true)}/>
        <div><Button type="submit" variant="outline" disabled={enrolling !== null}>{enrolling === "BORROWER" ? "Enabling…" : "Enable borrower workspace"}</Button></div>
      </form> : null}
      {canAddInvestor ? <form onSubmit={(event) => void enableRole("INVESTOR", event)} className="grid gap-4 rounded-lg border p-4">
        <div><h2 className="font-semibold">Investor workspace</h2><p className="mt-1 text-sm text-muted-foreground">Explore eligible loans and manage your investment portfolio.</p></div>
        <ProfileField label="Display name" value={newInvestorName} required maxLength={60} onChange={setNewInvestorName}/>
        <div><Button type="submit" variant="outline" disabled={enrolling !== null}>{enrolling === "INVESTOR" ? "Enabling…" : "Enable investor workspace"}</Button></div>
      </form> : null}
    </CardContent></Card> : <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Both borrower and investor workspaces are enabled for this account. You can switch between them from the top bar.</p>}
  </main>;
}
