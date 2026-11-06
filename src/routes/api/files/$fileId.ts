import { createFileRoute } from "@tanstack/react-router";
import { deleteCompanyFile, downloadCompanyFile } from "@/lib/lift/files.server";

export const Route = createFileRoute("/api/files/$fileId")({
  server: {
    handlers: {
      GET: ({ request, params }) => downloadCompanyFile(request, params.fileId),
      DELETE: ({ request, params }) => deleteCompanyFile(request, params.fileId),
    },
  },
});
