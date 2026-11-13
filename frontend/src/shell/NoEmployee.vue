<script setup lang="ts">
import { session } from "@/data/session"
import { EmptyState, PageActions, PageHeader } from "@/ui"

const reload = () => window.location.reload()
</script>

<template>
	<div>
		<PageHeader :title="`Welcome, ${session.context?.user.first_name}`" />
		<EmptyState
			icon="user-x"
			title="Your account isn't linked to an employee record yet"
			:message="`You're signed in as ${session.context?.user.name}, but no active employee profile uses this login. Ask HR to link it to your employee record, then refresh this page.`"
		/>
		<PageActions
			:primary="{ label: 'Refresh', icon: 'refresh-cw', onClick: reload }"
			:secondary="[{ label: 'Sign out', onClick: () => session.logout() }]"
		/>
	</div>
</template>
