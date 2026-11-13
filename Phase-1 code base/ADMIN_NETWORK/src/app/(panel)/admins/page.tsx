import { redirect } from "next/navigation";

// Team & roles moved to Hiring: Employees, Job roles and Access requests.
export default function TeamPage() {
  redirect("/hiring/employees");
}
