CCHG5
*IDENT    CCHG5  PCS.        98/10/06.
*/        ****   NOS 2.8.6-859 OS.
*/        ****   NS2G801.
*/        ****   REQUIRES - NONE.
*/        *****  PROBLEM - IF A CHARGE OR PROJECT EXPIRATION DATE
*/        IS SET TO A DATE AFTER 01/12/31, *CHARGE* PROCESSING
*/        WILL THINK THAT IT IS IMMEDIATELY EXPIRED.  THIS IS
*/        BECAUSE THE 18-BIT PACKED DATE FIELD BECOMES NEGATIVE
*/        ON THE DATE 02/01/01.
*/
*/        SOLUTION - CHANGE CODE IN *CHARGE* TO MASK THE PACKED
*/        DATE FIELD CORRECTLY.
*/
*/        NOTE - IN ADDITION TO THE DECK *VALEX* IN *NOS*, THE
*/        DECK *PTFS* (IN *RHP*) AND THE DECK *FTPS* (IN *TCP*)
*/        MUST BE REBUILT WITH THE MODIFIED VERSION OF *COMCCHG*.
*DECK     COMCCHG
*D,324
          MX5    -18
          BX4    -X5*X4
*D,407
          MX4    -18
          BX3    -X4*X3
*EDIT     COMCCHG
*/        END OF MODSET.
