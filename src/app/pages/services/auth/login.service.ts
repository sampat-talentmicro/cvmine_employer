import { Injectable, NgZone, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import { loginSuccess, loginFailure, logout } from '../../../store/actions/auth.actions';
import { AppState } from '../../../store/app.state';
import { environment } from '../../../../environments/environment';
// import { SharedService } from '../shared.service';
import { TransferState, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as forge from 'node-forge';
import { jsonParse } from '../../../functions/shared-functions';
import { Router } from '@angular/router';

const SECRET_KEY = 'T@MiCr097124!iCR'; // Encryption key
const IV = '1234567891234567'; // Initialization vector

// TransferState key to cache auth token
const AUTH_TOKEN_KEY = makeStateKey<string | null>('authToken');
const USER_DETAILS_KEY = makeStateKey<string | null>('userDetails');

@Injectable({
    providedIn: 'root',
})

export class LoginService {
    private loginSubject = new BehaviorSubject<boolean>(this.initializeLoginState());
    loginState$ = this.loginSubject.asObservable();
    private apiUrl = `${environment.apiUrl}icrweb/home/weblogin_tal_lite`;

    constructor(
        private http: HttpClient,
        private store: Store<AppState>,
        public router: Router,
        private ngZone: NgZone,
        private transferState: TransferState,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {}

    private initializeLoginState(): boolean {
        if (isPlatformBrowser(this.platformId)) {
            // In the browser, check sessionStorage
            return !!sessionStorage.getItem('authToken');
        } else {
            // On the server, retrieve the state from TransferState
            return !!this.transferState.get(AUTH_TOKEN_KEY, null);
        }
    }

    login(employeeId: string, password: string): Observable<any> {
        return this.http.post<any>(this.apiUrl, { employeeId, password }).pipe(
            map((response) => {
                if(response.status) {
                    const token = response.data.userDetails.token;
                    const userDetails = JSON.stringify(response.data.userDetails);
        
                    const encryptedToken = this.encrypt(token);
                    const encryptedUserDetails = this.encrypt(userDetails);
        
                    if (isPlatformBrowser(this.platformId)) {
                        // Store encrypted data in sessionStorage for the browser
                        sessionStorage.setItem('authToken', encryptedToken);
                        sessionStorage.setItem('userDetails', encryptedUserDetails);
                    } else {
                        // Store encrypted data in TransferState for the server
                        this.transferState.set(AUTH_TOKEN_KEY, encryptedToken);
                        this.transferState.set(USER_DETAILS_KEY, encryptedUserDetails);
                    }
        
                    // Dispatch the login success action
                    this.store.dispatch(loginSuccess({ token, user: response.data.userDetails }));
        
                    // Update the login state
                    this.ngZone.run(() => {
                        this.loginSubject.next(true);
                    });
                    return response;
                } else {
                    return response;
                }
                
            }),
            catchError((error) => {
                this.store.dispatch(loginFailure({ error }));
                this.ngZone.run(() => {
                    this.loginSubject.next(false);
                });
                throw error;
            })
        );
    }

    logout(): void {
        if (isPlatformBrowser(this.platformId)) {
            // Clear sessionStorage in the browser
            sessionStorage.clear();
            
        } else {
            // Clear TransferState on the server
            this.transferState.set(AUTH_TOKEN_KEY, null);
            // this.transferState.set(USER_DETAILS_KEY, null);
        }

        // Dispatch the logout action
        this.store.dispatch(logout());

        // Update the login state
        this.ngZone.run(() => {
            this.loginSubject.next(false);
        });
        this.router.navigate(['/login']);
    }

    isLoggedIn(): boolean {
        let token: string | null = null;
        const encryptedToken = sessionStorage?.getItem('authToken');
        if (encryptedToken) {
            token = this.decrypt(encryptedToken);
        }
        // const dtoken = this.transferState.get(AUTH_TOKEN_KEY, null);
        // console.log(dtoken);
        // const ttoken = this.decrypt(dtoken!);
        // console.log(ttoken);
        // if (isPlatformBrowser(this.platformId)) {
        //     const encryptedToken = sessionStorage.getItem('authToken');
        //     if (encryptedToken) {
        //         token = this.decrypt(encryptedToken);
        //     }
        // } else {
        //     const encryptedToken = this.transferState.get(AUTH_TOKEN_KEY, null);
        //     console.log(encryptedToken);
        //     if (encryptedToken) {
        //         token = this.decrypt(encryptedToken);
        //         console.log(token);
        //     }
        // }
        return !!token;
    }    

    getAuthToken(): string | null {
        if (isPlatformBrowser(this.platformId)) {
            const encryptedToken = sessionStorage.getItem('authToken');
            return encryptedToken ? this.decrypt(encryptedToken) : null;
        } else {
            const encryptedToken = this.transferState.get(AUTH_TOKEN_KEY, null);
            return encryptedToken ? this.decrypt(encryptedToken) : null;
        }
    }

    getUserDetails(): string | null {
        if (isPlatformBrowser(this.platformId)) {
            const encryptedDetails = sessionStorage.getItem('userDetails');
            return encryptedDetails ? jsonParse(this.decrypt(encryptedDetails)) : null;
        } else {
            const encryptedDetails = this.transferState.get(USER_DETAILS_KEY, null);
            return encryptedDetails ? jsonParse(this.decrypt(encryptedDetails)) : null;
        }
    }

    encrypt(value: string): string {
        try {
            const cipher = forge.cipher.createCipher('AES-CBC', SECRET_KEY);
            cipher.start({ iv: IV });
            cipher.update(forge.util.createBuffer(value, 'utf8'));
            cipher.finish();
            return forge.util.encode64(cipher.output.getBytes()); // Return Base64-encoded string
        } catch (err) {
            console.error('Encryption error:', err);
            return value;
        }
    }
    
    // Decrypt data
    decrypt(encryptedValue: string): string {
        try {
            if(encryptedValue) {
                const decipher = forge.cipher.createDecipher('AES-CBC', SECRET_KEY);
                decipher.start({ iv: IV });
                decipher.update(forge.util.createBuffer(forge.util.decode64(encryptedValue)));
                decipher.finish();
                return decipher.output.toString();
            } else {
                // console.error('Decryption error:', 'Invalid Encryption!');
                return encryptedValue;
            }
            
        } catch (err) {
            console.error('Decryption error:', err);
            return encryptedValue;
        }
    }
}
