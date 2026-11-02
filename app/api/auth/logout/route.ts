import { NextResponse } from "next/server";
import { destroyUserSession } from "@/app/_lib/auth";
export async function POST() {
  await destroyUserSession();
  return NextResponse.json({ success: true });
}
