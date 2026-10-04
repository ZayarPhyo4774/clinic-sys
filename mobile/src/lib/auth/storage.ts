import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "cs_access";
const REFRESH_KEY = "cs_refresh";
const BRANCH_KEY = "cs_branch";

export async function readStoredSession() {
  const [access, refresh, branchId] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(BRANCH_KEY),
  ]);
  return { access, refresh, branchId };
}

export async function storeTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function storeBranchId(branchId: string | null) {
  if (branchId) {
    await SecureStore.setItemAsync(BRANCH_KEY, branchId);
  } else {
    await SecureStore.deleteItemAsync(BRANCH_KEY);
  }
}

export async function clearStoredSession() {
  await Promise.all([ACCESS_KEY, REFRESH_KEY, BRANCH_KEY].map((key) => remove(key)));
}

async function remove(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    return;
  }
}
