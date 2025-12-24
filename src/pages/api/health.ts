import type { NextApiRequest, NextApiResponse } from "next";

type Data =
  | {
      ok: true;
      message: string;
      env: {
        hasSupabaseUrl: boolean;
        hasServiceRoleKey: boolean;
      };
    }
  | {
      ok: false;
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceRoleKey =
      !!process.env.NEXT_PUBLIC_SUPABASE_SECRET ||
      !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    return res.status(200).json({
      ok: true,
      message: "API is healthy",
      env: {
        hasSupabaseUrl,
        hasServiceRoleKey,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "Unexpected error",
    });
  }
}

