import { createClient } from "@/lib/supabase/server";
import WineMapClient from "./WineMapClient";
import AuthPrompt from "@/components/AuthPrompt";

export default async function WineMapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <AuthPrompt message="로그인 후 와인 지도를 확인할 수 있어요" />;
  }

  const { data: records } = await supabase
    .from("wine_records")
    .select("id, name, location, place_name, latitude, longitude, drunk_at, rating, photos, wine_type")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("drunk_at", { ascending: false });

  return <WineMapClient records={records ?? []} />;
}
