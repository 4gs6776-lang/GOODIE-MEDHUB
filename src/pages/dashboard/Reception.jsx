// 1. Safe Queue Movement & Removal
async function moveStage(patient, newStage){
  try {
    await updateRecord(patient.id, {
      queue_status: newStage,
      queue_updated_at: new Date().toISOString()
    })
  } catch (err) {
    showToast('Failed to update stage')
  }
}

async function removeFromQueue(patient){
  try {
    await updateRecord(patient.id, {
      queue_status: null
    })
    showToast(`${patient.full_name} removed from queue`)
  } catch (err) {
    showToast('Failed to remove patient from queue')
  }
}

// 2. Safe Canvas Image Compression
function compressImage(file, maxWidth = 240){
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        resolve(canvas.toDataURL('image/jpeg', 0.6))
      }

      img.onerror = reject
      img.src = reader.result
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
