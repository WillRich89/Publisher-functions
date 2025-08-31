const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Octokit } = require("@octokit/rest");

admin.initializeApp();
const db = admin.firestore();

// This is our ignition switch. It's a secure, callable function.
exports.triggerBuild = functions.https.onCall(async (data, context) => {

  // 1. SECURITY CHECK: Is a real user pressing the button?
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to start a build."
    );
  }

  const userId = context.auth.uid;
  const projectId = data.projectId;

  if (!projectId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "A project ID must be provided."
    );
  }

  // 2. OWNERSHIP CHECK: Does this project belong to the user?
  const projectRef = db.collection("projects").doc(projectId);
  const projectDoc = await projectRef.get();

  if (!projectDoc.exists || projectDoc.data().userId !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You do not have permission to build this project."
    );
  }

  // 3. THE "GO" COMMAND: Send the signal to the factory
  try {
    const octokit = new Octokit({
      // We will need to create and add this secret to our function's environment
      auth: process.env.GITHUB_TOKEN, 
    });

    // This is the "wake-up" call.
    await octokit.actions.createWorkflowDispatch({
      owner: "WillRich89", // Your GitHub username
      repo: "publisher-worker", // The name of our factory repository
      workflow_id: "build.yml", // The name of our factory's rulebook
      ref: "main", // The branch to run on
    });

    // 4. THE CONFIRMATION: Let the user know the factory is starting
    return { status: "success", message: "Build successfully queued!" };

  } catch (error) {
    console.error("Error triggering GitHub Action:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to trigger the build process."
    );
  }
});
