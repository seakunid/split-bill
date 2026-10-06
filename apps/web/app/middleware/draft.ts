export default defineNuxtRouteMiddleware(() => {
  const { draft } = useBillDraft()
  if (draft.value.items.length === 0) return navigateTo('/')
})
