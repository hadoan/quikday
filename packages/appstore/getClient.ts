import { PrismaService } from "@quikday/prisma";
import { sl } from "zod/v4/locales";


// const client = new Client(process.env.BEARER_TOKEN);
export const getClient = async (userId: number, slug: string, prisma: PrismaService) => {

  // Resolve a credential for the given user.
  // Strategy: pick the most recently-updated valid credential belonging to the user.
  const userCredential = await prisma.credential.findFirst({
    where: { userId, invalid: false, appId: slug },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (!userCredential) return false;

  const credential = await prisma.credential.findUnique({
    where: { id: userCredential.id },
  });

  let accessToken: string | undefined;
  // accessToken = await refreshAccessToken(accessToken,client_id,client_secret,client_id);
  if (
    credential &&
    typeof credential.key === "object" &&
    credential.key !== null
  ) {
    accessToken = (credential.key as Record<string, unknown>).access_token as
      | string
      | undefined;
    if (!accessToken && (credential.key as any).token !== null) {
      accessToken = ((credential.key as any).token as Record<string, unknown>)
        .access_token as string | undefined;
    }
  }
  if (accessToken) return accessToken;
  else return false;
};
