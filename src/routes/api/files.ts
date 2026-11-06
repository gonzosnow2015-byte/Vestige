import { createFileRoute } from "@tanstack/react-router";
import { uploadCompanyFile } from "@/lib/lift/files.server";

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      POST: ({ request }) => uploadCompanyFile(request),
    },
  },
});
