import { connectMongo } from "@/lib/mongoose";
import { Contract } from "@/models/Contract";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import ContractLive from "@/components/contract-live";
import { isValidObjectId } from "mongoose";

// Reading request cookies makes this page dynamic
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ContractLean = {
  _id: string;
  address: string;
  question: string;
  answer: string;
  code: string;
  files?: { name: string; content: string }[];
  title?: string;
  model?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export default async function SolPage({ params }: { params: { id: string } }) {
  await connectMongo();
  if (!isValidObjectId(params.id)) return notFound();
  const doc = await Contract.findById(params.id).lean<ContractLean>();
  if (!doc) return notFound();
  const cookieStore = await cookies();
  const wallet = cookieStore.get("walletAddress")?.value;
  if (!wallet || wallet.toLowerCase() !== String(doc.address).toLowerCase()) return notFound();

  return <ContractLive initial={{ ...doc, _id: doc._id.toString() }} />;
}