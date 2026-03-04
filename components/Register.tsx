"use client";

import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type FormValues = {
  name: string;
  email: string;
  password: string;
};

export default function Register({ isAdmin = false }: { isAdmin?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    const nameTrimmed = (data.name ?? "").trim();
    if (!isAdmin) {
      setMessage({ type: "error", text: "Registration is restricted to admins only." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: nameTrimmed },
      },
    });

    if (error) {
      setLoading(false);
      setMessage({ type: "error", text: error.message });
      return;
    }

    if (authData.user) {
      const { error: usersError } = await supabase.from("users").insert({
        auth_id: authData.user.id,
        email: authData.user.email ?? data.email,
        full_name: nameTrimmed,
        app_role: "user",
      });
      if (usersError) {
        setLoading(false);
        setMessage({ type: "error", text: `Account created but profile save failed: ${usersError.message}` });
        return;
      }
    }

    setLoading(false);
    reset();
    setMessage({ type: "success", text: isAdmin ? "User registered! They can now sign in." : "Account created! You can now sign in." });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-navy-950 via-navy-900/80 to-navy-950 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-xl"
      >
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          {isAdmin ? "Register new user" : "Admin registration"}
        </h1>
        <p className="text-center text-white/60 text-sm mb-6">
          {isAdmin ? "Add a team member to sign up and use the app." : "In-house only. Registration restricted to admin."}
        </p>

        {message && (
          <p
            className={`mb-4 p-3 rounded-xl text-sm ${
              message.type === "error"
                ? "bg-red-500/10 text-red-200 border border-red-400/30"
                : "bg-emerald-500/10 text-emerald-200 border border-emerald-400/30"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Full Name"
            className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${
              errors.name ? "border-red-400/50" : "border-navy-800"
            }`}
            {...register("name", { required: "Name is required" })}
          />
          {errors.name && (
            <p className="text-red-300 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="mb-4">
          <input
            type="email"
            placeholder="Email"
            className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${
              errors.email ? "border-red-400/50" : "border-navy-800"
            }`}
            {...register("email", { required: "Email is required" })}
          />
          {errors.email && (
            <p className="text-red-300 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="mb-6">
          <input
            type="password"
            placeholder="Password"
            className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${
              errors.password ? "border-red-400/50" : "border-navy-800"
            }`}
            {...register("password", {
              required: "Password is required",
              minLength: { value: 6, message: "Password must be at least 6 characters" },
            })}
          />
          {errors.password && (
            <p className="text-red-300 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-navy-700 text-white p-3 rounded-xl font-semibold hover:bg-navy-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account…" : "Register"}
        </button>

        <p className="text-sm text-center text-white/60 mt-4">
          <Link href="/dashboard" className="text-navy-400 hover:text-white hover:underline">
            Back to dashboard
          </Link>
        </p>
      </form>
    </div>
  );
}
