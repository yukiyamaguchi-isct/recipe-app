import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PhotoPicker } from "@/app/upload/photo-picker";

/**
 * S-03 アップロード / 解析中（`UI_DESIGN.md` 3章）。
 *
 * この段階では写真の選択と検証までを持つ。解析の開始と進捗表示は段階11で足す。
 */
export default async function UploadPage() {
  const session = await auth();

  // 認可の本体はここ。proxy.ts の matcher が変わっても保護が外れない（design.md 5.4）
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <PhotoPicker />;
}
