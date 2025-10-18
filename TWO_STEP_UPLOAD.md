# Two-Step Upload Wizard

## Overview
The upload dialog now uses a two-step wizard flow that prioritizes file selection and then reviews auto-detected metadata.

## Step Flow

### **Step 1: File Selection** 📁
The first screen focuses entirely on selecting your test report file.

**What You See:**
- File type tabs (HTML ZIP or JSON)
- File upload input
- Instructions on how to generate reports

**What Happens:**
1. You select a file
2. If ZIP: Auto-detection runs (~1 second)
3. Automatically advances to Step 2

**No metadata fields visible yet** - keeps the first step simple and focused.

---

### **Step 2: Metadata Review** ✏️
After file selection, you see the metadata form with auto-filled values.

**What You See:**
- Environment (pre-filled)
- Trigger (pre-filled)
- Branch (pre-filled)
- Commit SHA (pre-filled)
- Back button to change file
- Upload button to submit

**All fields are editable** - You can change any auto-detected value.

---

## User Experience

### ZIP Upload Flow:
```
1. Open dialog
   ↓
2. Select HTML Report ZIP tab
   ↓
3. Click "Choose File"
   ↓
4. Select playwright-report.zip
   ↓
5. [Auto-detecting... 1s]
   ↓
6. ✨ Step 2 appears with filled fields
   ↓
7. Review/edit metadata
   ↓
8. Click "Upload"
```

### JSON Upload Flow:
```
1. Open dialog
   ↓
2. Select JSON Report tab
   ↓
3. Click "Choose File"
   ↓
4. Select results.json
   ↓
5. Step 2 appears with default values
   ↓
6. Fill in metadata manually
   ↓
7. Click "Upload"
```

---

## Auto-Detection (ZIP Only)

When you select a ZIP file:

### **What Gets Auto-Filled:**
- ✅ **Commit Hash** - From GitHub Actions metadata
- ✅ **Branch** - Detected from URL or defaults to "main"
- ✅ **Environment** - Inferred from branch name
- ✅ **Trigger** - Inferred from workflow type

### **Smart Defaults:**
If detection fails or you upload JSON:
- Branch: "main"
- Environment: "development"
- Trigger: "ci"
- Commit: empty (optional)

---

## Navigation

### **Back Button** (Step 2)
- Returns to Step 1
- Clears file selection
- Resets all metadata fields
- Lets you choose a different file

### **Cancel Button** (Step 1)
- Closes dialog
- No upload performed

### **Upload Button** (Step 2)
- Disabled until all required fields filled
- Shows "Uploading..." during upload
- Shows success/error message
- Auto-closes on success

---

## Visual Changes

### Step 1 Header:
```
Upload Test Results
Select your Playwright test report file to begin
```

### Step 2 Header:
```
Upload Test Results - Review Metadata
Review and edit the detected metadata before uploading
```

---

## Benefits

### 🎯 **Clearer Flow**
- One task per screen
- Less overwhelming
- Progressive disclosure

### ⚡ **Faster**
- Auto-detection happens immediately
- No waiting for user to click "detect"
- Natural progression

### ✏️ **More Control**
- All fields still editable
- Easy to go back and change file
- Clear what's happening at each step

### 📱 **Better UX**
- Matches common wizard patterns
- Mobile-friendly (one screen at a time)
- Clear progress indication

---

## Edge Cases

### **File Selected But Detection Fails:**
- Still advances to Step 2
- Shows default values
- User can fill manually
- No error shown

### **Switching File Types:**
- Can switch between ZIP/JSON tabs on Step 1
- If file already selected, need to click Back
- Each file type has appropriate handling

### **Upload Error:**
- Error shown on Step 2
- Can edit and retry
- Can go Back to change file
- Error message explains what failed

---

## Technical Details

### State Management:
```typescript
const [step, setStep] = useState<1 | 2>(1)
```

### Step Transitions:
```typescript
// After file selection + auto-detection
setTimeout(() => {
  setStep(2)
}, 100)

// Back button
const handleBack = () => {
  setStep(1)
  // Reset everything
}
```

### Conditional Rendering:
```tsx
{step === 1 && (
  // File selection UI
)}

{step === 2 && (
  // Metadata review UI
)}
```

### Button Visibility:
```tsx
{step === 1 && <Button>Cancel</Button>}
{step === 2 && <Button>Back</Button>}
{step === 2 && <Button>Upload</Button>}
```

---

## Future Enhancements

Potential improvements:
- Progress indicator (Step 1 of 2)
- Preview of detected values on Step 1
- Bulk upload (select multiple files)
- Save metadata presets
- Remember last used values
