<script setup lang="ts">
import { onMounted } from "vue"
import { session } from "@/data/session"
import AppShell from "@/shell/AppShell.vue"
import NoEmployee from "@/shell/NoEmployee.vue"
import { EmptyState, Skeleton } from "@/ui"

onMounted(() => session.load())
const reload = () => window.location.reload()
</script>

<template>
	<div v-if="session.loading && !session.context" class="boot">
		<Skeleton :lines="3" label="Loading your workspace" />
	</div>
	<div v-else-if="session.error" class="boot">
		<EmptyState
			icon="wifi-off"
			title="Couldn't load GAMCS HR"
			:message="session.error"
			:action="{ label: 'Try again', onClick: reload }"
		/>
	</div>
	<AppShell v-else-if="session.context">
		<NoEmployee v-if="!session.context.employee" />
		<RouterView v-else />
	</AppShell>
</template>

<style scoped>
.boot {
	max-width: 480px;
	margin: 0 auto;
	padding: var(--space-6) var(--space-2);
}
</style>
