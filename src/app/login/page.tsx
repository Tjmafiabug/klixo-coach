import LoginForm from "./LoginForm";
import { loginPhoto } from "./photo";

export default async function LoginPage() {
  const photo = await loginPhoto();
  return <LoginForm photo={photo} />;
}
