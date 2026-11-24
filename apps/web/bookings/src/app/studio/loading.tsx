import { StudioLoading } from "@/components/studio/studio-alert";
import { StudioPlainFrame } from "@/components/studio/studio-shell";

export default function Loading() {
  return (
    <StudioPlainFrame>
      <StudioLoading>Loading...</StudioLoading>
    </StudioPlainFrame>
  );
}
