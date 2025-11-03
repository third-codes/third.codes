import SolidityViewer from "@/components/solidity-viewer";

// Static /sol page: shows history sidebar with no active contract selected
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SolIndexPage() {
  return (
    <div className="h-svh pt-5">
      <SolidityViewer
        code=""
        files={undefined}
        height="calc(100svh - 90px)"
        loading={false}
        skeletonLines={24}
        prompt={undefined}
      />
    </div>
  );
}