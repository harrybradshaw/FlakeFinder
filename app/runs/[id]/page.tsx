import { TestDetailsView } from "@/components/test-details-view";
import { notFound } from "next/navigation";
import { getTestRunById } from "@/lib/test-runs";

export default async function TestRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const testRun = await getTestRunById(id);

  if (!testRun) {
    notFound();
  }

  return <TestDetailsView testRun={testRun} />;
}
