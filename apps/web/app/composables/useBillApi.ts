import { createBillApi, resolveUseMockApi } from '../../lib/api'

export function useBillApi() {
  const config = useRuntimeConfig()
  const useMock = computed(() => resolveUseMockApi(config.public.useMockApi))
  const api = computed(() =>
    createBillApi({
      baseUrl: String(config.public.apiBaseUrl ?? ''),
      useMock: useMock.value,
    }),
  )
  return { api, useMock }
}
