import { type TestRunRepository } from "@/lib/repositories";

export type TestRunWithDetails = NonNullable<
  Awaited<ReturnType<TestRunRepository["getTestRunWithFullDetails"]>>
>;

export type TestsWithSuiteDetails = NonNullable<
  Awaited<ReturnType<TestRunRepository["getTestsWithSuiteDetails"]>>
>;
