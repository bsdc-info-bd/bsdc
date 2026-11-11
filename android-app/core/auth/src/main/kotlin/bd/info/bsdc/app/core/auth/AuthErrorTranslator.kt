package bd.info.bsdc.app.core.auth

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.network.SupabaseApiException
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException

object AuthErrorTranslator {

    fun toUserMessage(throwable: Throwable, language: AppLanguage): String {
        val bn = language == AppLanguage.BN
        return when (throwable) {
            is GetCredentialCancellationException -> ""
            is NoCredentialException -> if (bn) {
                "এই ডিভাইসে কোনো Google অ্যাকাউন্ট পাওয়া যায়নি। ডিভাইস সেটিংসে একটি অ্যাকাউন্ট যোগ করুন বা ইমেইল ব্যবহার করুন।"
            } else {
                "No Google account was found on this device. Add one in Android settings or use Email sign-in."
            }
            is FirebaseAuthWeakPasswordException -> if (bn) {
                "পাসওয়ার্ডটি দুর্বল — অন্তত ৮ অক্ষর, বড়/ছোট হাতের অক্ষর এবং সংখ্যা ব্যবহার করুন।"
            } else {
                "Password is too weak — use at least 8 characters with mixed case, numbers, or symbols."
            }
            is FirebaseAuthUserCollisionException -> if (bn) {
                "এই ইমেইলে ইতিমধ্যেই একটি অ্যাকাউন্ট রয়েছে। অনুগ্রহ করে সাইন ইন করুন।"
            } else {
                "An account with this email already exists. Please sign in instead."
            }
            is FirebaseAuthInvalidUserException -> if (bn) {
                "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।"
            } else {
                "No BSDC account was found with that email address."
            }
            is FirebaseAuthInvalidCredentialsException -> if (bn) {
                "ইমেইল বা পাসওয়ার্ড সঠিক নয়।"
            } else {
                "Invalid email or password. Please double-check and try again."
            }
            is FirebaseNetworkException -> if (bn) {
                "ইন্টারনেট সংযোগ ব্যর্থ হয়েছে। নেটওয়ার্ক পরীক্ষা করে আবার চেষ্টা করুন।"
            } else {
                "Network connection unavailable. Check your internet and try again."
            }
            is FirebaseAuthException -> when (throwable.errorCode) {
                "ERROR_TOO_MANY_REQUESTS" -> if (bn) {
                    "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"
                } else {
                    "Too many sign-in attempts. Please wait a moment and try again."
                }
                else -> throwable.localizedMessage ?: if (bn) "প্রমাণীকরণ ব্যর্থ হয়েছে।" else "Authentication failed."
            }
            is SupabaseApiException -> when {
                throwable.pgCode == "23505" -> if (bn) {
                    "এই ইউজারনেমটি ইতিমধ্যেই নেওয়া হয়েছে। অন্য একটি বেছে নিন।"
                } else {
                    "That username is already taken. Please pick another handle."
                }
                throwable.statusCode == 401 -> if (bn) {
                    "সেশন মেয়াদোত্তীর্ণ হয়েছে। পুনরায় সাইন ইন করুন।"
                } else {
                    "Session expired. Please sign in again."
                }
                else -> throwable.message
            }
            else -> throwable.localizedMessage ?: if (bn) "একটি ত্রুটি ঘটেছে।" else "Something went wrong."
        }
    }
}
