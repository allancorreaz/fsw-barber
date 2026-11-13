import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/_lib/auth";
import { startServiceCheckout } from "@/app/_lib/checkout";

type Context = { params: Promise<{ bookingId: string }> };

/** Gera o link de pagamento (Pix ou cartão) de um serviço avulso. */
export async function POST(_: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  const { bookingId } = await context.params;
  try {
    const url = await startServiceCheckout(user.id, bookingId);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o pagamento.",
      },
      { status: 400 },
    );
  }
}
