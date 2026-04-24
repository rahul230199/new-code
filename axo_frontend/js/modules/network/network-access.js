/****************************************************
AXO NETWORKS – NETWORK ACCESS FORM JS
FINAL FIXED VERSION (PRODUCTION SAFE)
****************************************************/

document.addEventListener("DOMContentLoaded", function () {

const form = document.getElementById("accessForm");
if (!form) return;

const successBox = document.getElementById("successMessage");
const errorBox = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");

const submitButton = form.querySelector("button[type='submit']");

/* =====================================================
   UI HELPERS
===================================================== */

function showError(message) {

    if (!errorBox || !errorText) return;

    errorText.textContent = message;
    errorBox.style.display = "block";

    if (successBox) successBox.style.display = "none";

    setTimeout(function () {
        errorBox.style.display = "none";
    }, 4000);

}

function showSuccess() {

    if (!successBox) return;

    successBox.style.display = "block";

    if (errorBox) errorBox.style.display = "none";

    form.reset();

    setTimeout(function () {
        successBox.style.display = "none";
    }, 5000);

}

function disableSubmit() {

    if (!submitButton) return;

    submitButton.disabled = true;
    submitButton.innerHTML = "Submitting...";

}

function enableSubmit() {

    if (!submitButton) return;

    submitButton.disabled = false;
    submitButton.innerHTML =
        "Submit Request <i class='fas fa-arrow-right'></i>";

}

/* =====================================================
   FORM SUBMIT
===================================================== */

form.addEventListener("submit", async function (e) {

    e.preventDefault();
    disableSubmit();

    try {

        /* ===============================
           COLLECT CHECKBOX VALUES
        =============================== */

        const whatYouDo = Array.from(
            form.querySelectorAll('input[name="whatYouDo"]:checked')
        ).map(el => el.value);

        if (whatYouDo.length === 0) {

            showError("Please select at least one option for 'What do you do'");
            enableSubmit();
            return;

        }

        const roleInEVInput =
            form.querySelector('input[name="roleInEV"]:checked');

        if (!roleInEVInput) {

            showError("Please select your role in EV manufacturing");
            enableSubmit();
            return;

        }

        /* ===============================
           BUILD PAYLOAD (MATCH DATABASE)
        =============================== */

        const payload = {

            company_name: form.companyName.value.trim(),
            website: form.website.value.trim(),
            registered_address: form.registeredAddress.value.trim(),
            city_state: form.cityState.value.trim(),

            contact_name: form.contactName.value.trim(),
            role_requested: form.role.value.trim(),

            email: form.email.value.trim(),
            phone: form.phone.value.trim(),

            what_you_do: whatYouDo,

            primary_product: form.primaryProduct.value.trim(),
            key_components: form.keyComponents.value.trim(),
            manufacturing_locations: form.manufacturingLocations.value.trim(),
            monthly_capacity: form.monthlyCapacity.value.trim(),

            certifications: form.certifications.value.trim(),

            role_in_ev: roleInEVInput.value,
            why_join_axo: form.whyJoinAXO.value.trim()

        };

        /* ===============================
           REQUIRED FIELD CHECK
        =============================== */

        const requiredFields = [

            "company_name",
            "city_state",
            "contact_name",
            "role_requested",
            "email",
            "phone",
            "primary_product",
            "key_components",
            "manufacturing_locations",
            "monthly_capacity",
            "role_in_ev",
            "why_join_axo"

        ];

        for (const field of requiredFields) {

            if (!payload[field]) {

                showError("Please fill all required fields");
                enableSubmit();
                return;

            }

        }

        /* ===============================
           SEND REQUEST TO BACKEND
        =============================== */

        const response = await fetch("/api/network/request-access", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)

        });

        const text = await response.text();

        let json;

        try {

            json = JSON.parse(text);

        } catch {

            throw new Error("Server returned invalid response");

        }

        if (!response.ok || !json.success) {

            throw new Error(
                json?.error ||
                json?.message ||
                "Submission failed"
            );

        }

        showSuccess();

    }

    catch (error) {

        console.error("Network Request Error:", error);

        showError(
            error.message || "Submission failed. Please try again."
        );

    }

    finally {

        enableSubmit();

    }

});

});

