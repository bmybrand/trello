"use client";

import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type FormValues = {
  name: string;
  email: string;
  password: string;
  role: string;
};

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.name, app_role: data.role },
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
        full_name: data.name,
        app_role: data.role,
      });
      if (usersError) {
        setLoading(false);
        setMessage({ type: "error", text: `Account created but profile save failed: ${usersError.message}` });
        return;
      }
    }

    setLoading(false);
    reset();
    setMessage({ type: "success", text: "Account created! You can now sign in." });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-blue-300 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white shadow-lg rounded-xl p-8 w-full max-w-md"
      >
        <h1 className="text-3xl font-bold text-center text-blue-700 mb-6">
          Register
        </h1>

        {message && (
          <p
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === "error"
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Full Name"
            className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
            {...register("name", { required: "Name is required" })}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="mb-4">
          <select
            className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition bg-white ${
              errors.role ? "border-red-500" : "border-gray-300"
            }`}
            {...register("role", { required: "Role is required" })}
          >
            <option value="">Choose your role</option>
            <option value="developer">Developer</option>
            <option value="designer">Designer</option>
            <option value="project_manager">Project Manager</option>
          </select>
          {errors.role && (
            <p className="text-red-500 text-sm mt-1">{errors.role.message}</p>
          )}
        </div>

        <div className="mb-4">
          <input
            type="email"
            placeholder="Email"
            className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
            {...register("email", { required: "Email is required" })}
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="mb-6">
          <input
            type="password"
            placeholder="Password"
            className={`w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 transition ${
              errors.password ? "border-red-500" : "border-gray-300"
            }`}
            {...register("password", {
              required: "Password is required",
              minLength: { value: 6, message: "Password must be at least 6 characters" },
            })}
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account…" : "Register"}
        </button>

        <p className="text-sm text-center text-gray-500 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
