import Link from "next/link";
export default function RegisterPage() {
  return <main className="grid min-h-screen place-items-center px-5"><section className="surface w-full max-w-md rounded-3xl p-8"><Link href="/" className="text-xl font-black">barber.</Link><h1 className="mt-8 text-3xl font-black">Criar sua conta</h1><p className="mt-2 text-sm text-neutral-400">O cadastro de consumidor estará disponível após conectar o formulário de autenticação.</p><Link href="/login" className="mt-6 inline-flex text-sm font-bold text-[#c8f169]">Já tenho conta</Link></section></main>;
}
