"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Upload,
  X,
  Loader,
} from "lucide-react";

interface KYCGateProps {
  userId: string;
  userEmail: string;
  onKYCComplete: () => void;
  onClose: () => void;
  planName: string;
  investmentAmount: number;
}

export default function KYCGate({
  userId,
  userEmail,
  onKYCComplete,
  onClose,
  planName,
  investmentAmount,
}: KYCGateProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Personal Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  // Step 2: Document Upload
  const [docType, setDocType] = useState<"passport" | "id" | "driver_license">(
    "passport",
  );
  const [docFile, setDocFile] = useState<File | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Step 3: Verification
  const [verified, setVerified] = useState(false);

  const isStep1Valid =
    firstName.trim() &&
    lastName.trim() &&
    dateOfBirth &&
    nationality &&
    address.trim() &&
    city.trim() &&
    postalCode.trim() &&
    country;

  const isStep2Valid = docFile && proofFile;

  async function submitKYC() {
    if (!isStep1Valid || !isStep2Valid) return;
    setLoading(true);
    setError("");

    try {
      // Upload documents to storage
      const timestamp = Date.now();

      // Upload identity document
      const docFileName = `kyc/${userId}/identity_${timestamp}`;
      const { error: docError } = await supabase.storage
        .from("documents")
        .upload(docFileName, docFile!);

      if (docError)
        throw new Error(`Document upload failed: ${docError.message}`);

      // Upload proof of address
      const proofFileName = `kyc/${userId}/proof_of_address_${timestamp}`;
      const { error: proofError } = await supabase.storage
        .from("documents")
        .upload(proofFileName, proofFile!);

      if (proofError)
        throw new Error(`Proof upload failed: ${proofError.message}`);

      // Save KYC record to database
      const { error: dbError } = await supabase.from("user_kyc").upsert(
        {
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email: userEmail,
          date_of_birth: dateOfBirth,
          nationality: nationality,
          address: address,
          city: city,
          postal_code: postalCode,
          country: country,
          document_type: docType,
          identity_document_path: docFileName,
          proof_of_address_path: proofFileName,
          status: "pending_review",
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (dbError) throw new Error(`Database error: ${dbError.message}`);

      setVerified(true);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      console.error("KYC submission error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden bg-slate-900 border border-white/8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-white font-black text-lg">
              Complete KYC Verification
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Required to proceed with investment
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 flex gap-3">
                <FileText size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-300">
                  <p className="font-bold mb-1">Investment Details</p>
                  <p>
                    Plan: <span className="text-white">{planName}</span>
                  </p>
                  <p>
                    Amount:{" "}
                    <span className="text-white">
                      {investmentAmount !== undefined && (
                        <span className="text-white">
                          ${investmentAmount.toLocaleString()}
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 font-bold mb-2">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      Nationality *
                    </label>
                    <input
                      type="text"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="United States"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      Country *
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="United States"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 font-bold mb-2">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      City *
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 font-bold mb-2">
                      Postal Code *
                    </label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                      placeholder="10001"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 font-bold mb-3">
                  Identity Document Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "passport", label: "Passport" },
                    { id: "id", label: "ID Card" },
                    { id: "driver_license", label: "Driver License" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() =>
                        setDocType(
                          option.id as "passport" | "id" | "driver_license",
                        )
                      }
                      className={`px-4 py-3 rounded-lg text-xs font-bold transition-all border ${
                        docType === option.id
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 font-bold mb-3">
                  Upload{" "}
                  {docType === "passport"
                    ? "Passport"
                    : docType === "id"
                      ? "ID Card"
                      : "Driver License"}{" "}
                  *
                </label>
                <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-emerald-500 transition">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="doc-upload"
                  />
                  <label
                    htmlFor="doc-upload"
                    className="flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <Upload size={24} className="text-emerald-400" />
                    <p className="text-white font-bold text-sm">
                      {docFile ? docFile.name : "Click or drag to upload"}
                    </p>
                    <p className="text-slate-600 text-xs">
                      PNG, JPG, or PDF · Max 10MB
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 font-bold mb-3">
                  Proof of Address (Bank Statement, Utility Bill, etc.) *
                </label>
                <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-emerald-500 transition">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="proof-upload"
                  />
                  <label
                    htmlFor="proof-upload"
                    className="flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <Upload size={24} className="text-emerald-400" />
                    <p className="text-white font-bold text-sm">
                      {proofFile ? proofFile.name : "Click or drag to upload"}
                    </p>
                    <p className="text-slate-600 text-xs">
                      PNG, JPG, or PDF · Max 10MB
                    </p>
                  </label>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 flex gap-2">
                  <AlertTriangle
                    size={14}
                    className="text-red-400 shrink-0 mt-0.5"
                  />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center py-8">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/40 rounded-full flex items-center justify-center">
                  <CheckCircle size={32} className="text-emerald-400" />
                </div>
              </div>
              <div>
                <h3 className="text-white font-black text-lg mb-2">
                  KYC Submitted Successfully
                </h3>
                <p className="text-slate-400 text-sm">
                  Your verification documents have been submitted and are under
                  review.
                </p>
              </div>
              <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 mt-4">
                <p className="text-blue-300 text-xs">
                  <span className="font-bold">What's next?</span> We typically
                  complete verification within 24 hours. You'll receive an email
                  confirmation once your KYC is approved. Then you can proceed
                  with your investment.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-6 py-4 flex gap-3 justify-between">
          <button
            onClick={
              step === 3 ? onClose : step === 2 ? () => setStep(1) : onClose
            }
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-900/60 transition"
          >
            {step === 3 ? "Close" : "Back"}
          </button>
          {step !== 3 && (
            <div className="flex gap-3">
              {step === 1 && (
                <button
                  onClick={() => setStep(2)}
                  disabled={!isStep1Valid}
                  className="px-6 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Continue
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={submitKYC}
                  disabled={!isStep2Valid || loading}
                  className="px-6 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit KYC"
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
