import { createFileRoute } from "@tanstack/react-router";
import { seedOperator } from "@/lib/operator-seed.functions";

export const Route = createFileRoute("/api/public/seed-operator")({
  server: {
    handlers: {
      GET: async () => {
        const result = await seedOperator();
        return Response.json(result);
      },
    },
  },
});
