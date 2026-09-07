import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export function useResetDb() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ status: string }>("/admin/reset-db", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["records"] });
      queryClient.invalidateQueries({ queryKey: ["conflicts"] });
    },
  });
}
