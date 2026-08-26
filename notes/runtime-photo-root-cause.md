Runtime finding after restored 0.9.344 classifier still failed in production:

Current develop added a post-message claim gate before personal photo forwarding. Baseline 0.9.344 did not have this gate. If claimPostMessage returns no token, executePostMessageSent returns before fastForwardPersonalReportPhotos is reached. This can strand valid work photos regardless of classifier result.

Safe correction: preserve claim for receipt/financial processing, but do not let that claim gate suppress the non-receipt/non-mailing personal photo forwarding path.
