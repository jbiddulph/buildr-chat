<template>
  <div class="buildr-run-controls">
    <button 
      @click="runStep" 
      :disabled="running"
      class="run-button run-button-single"
    >
      <span v-if="running && !runningAll">Running...</span>
      <span v-else>Run Build</span>
    </button>

    <button 
      @click="runAllSteps" 
      :disabled="running"
      class="run-button run-button-all"
    >
      <span v-if="runningAll">Running All Steps...</span>
      <span v-else>Run All Steps</span>
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  appId: string
}

const props = defineProps<Props>()

const running = ref(false)
const runningAll = ref(false)

async function runStep() {
  if (running.value) return
  
  running.value = true
  try {
    await $fetch('/api/buildr/run-step', {
      method: 'POST',
      body: { app_id: props.appId }
    })
  } catch (error) {
    console.error('Error running step:', error)
    // You might want to show an error notification here
  } finally {
    running.value = false
  }
}

async function runAllSteps() {
  if (running.value) return
  
  running.value = true
  runningAll.value = true
  
  try {
    while (true) {
      const res = await $fetch('/api/buildr/run-step', {
        method: 'POST',
        body: { app_id: props.appId }
      })
      
      if (res.status === 'done') {
        break
      }
      
      // Small delay between steps to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } catch (error) {
    console.error('Error running steps:', error)
    // You might want to show an error notification here
  } finally {
    running.value = false
    runningAll.value = false
  }
}
</script>

<style scoped>
.buildr-run-controls {
  @apply flex gap-3;
}

.run-button {
  @apply px-4 py-2 rounded-lg font-medium transition-colors;
  @apply disabled:opacity-50 disabled:cursor-not-allowed;
}

.run-button-single {
  @apply bg-blue-500 text-white hover:bg-blue-600;
}

.run-button-all {
  @apply bg-green-500 text-white hover:bg-green-600;
}
</style>

