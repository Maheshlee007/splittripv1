import { Outlet } from "react-router-dom";
import { PersonalStoreProvider } from "@/store/PersonalStore";

export default function PersonalLayout() {
  return (
    <PersonalStoreProvider>
      <Outlet />
    </PersonalStoreProvider>
  );
}
